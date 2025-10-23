import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { sleep, filterLinksWithName } from "./utils.js";

const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const parseProxy = (p) => {
  const parts = p.split(":");
  if (parts.length === 2) return { host: parts[0], port: parts[1] };
  if (parts.length === 4) {
    const [host, port, username, password] = parts;
    return { host, port, username, password };
  }
  return { host: parts[0], port: parts[1] || "80" };
};

export const scrapeProfiles = async (urlsArr) => {
  const progressFile = path.resolve("./progress_profiles.json");

  // Load previous progress
  const saved = fs.existsSync(progressFile)
    ? JSON.parse(fs.readFileSync(progressFile, "utf8"))
    : {};

  const completedProfiles = new Set(saved.completedProfiles || []);
  const failedProfiles = new Set(saved.failedProfiles || []);
  const profiles = saved.profiles || [];

  // Merge input + previous failed profiles, remove duplicates and filter links with name
  const filteredLinks = [
    ...new Set([...filterLinksWithName(urlsArr), ...failedProfiles])
  ];

  if (!config.proxies || config.proxies.length === 0) {
    throw new Error("No proxies defined in config.json");
  }
  const proxies = config.proxies.map(parseProxy);

  const scrapeProfile = async (link, proxy, idx, total, iteration) => {
    if (completedProfiles.has(link)) return null;

    const proxyArg = `${proxy.host}:${proxy.port}`;
    console.log(`(${iteration}) [${idx + 1}/${total}] Scraping ${link} via proxy ${proxyArg}`);

    const browser = await puppeteer.launch({
      headless: config.headless,
      args: [`--proxy-server=${proxyArg}`],
    });

    const page = await browser.newPage();
    await page.setUserAgent(config.userAgent);

    if (proxy.username && proxy.password) {
      try {
        await page.authenticate({ username: proxy.username, password: proxy.password });
      } catch {
        console.warn(`⚠️ Proxy auth failed for ${proxyArg}`);
      }
    }

    try {
      await page.goto(link, { waitUntil: "networkidle2", timeout: config.pageOptions.timeout });

      const profileData = {};

      // Simple fields
      for (const [key, fieldCfg] of Object.entries(config.profile.fields)) {
        if (typeof fieldCfg === "string") {
          const el = await page.$(fieldCfg);
          profileData[key] = el ? await page.evaluate(e => e.innerText.trim(), el) : "";
        }
      }

      // Education
      if (config.profile.fields.education) {
        const edCfg = config.profile.fields.education;
        const edData = await page.$$eval(edCfg.listSelector, (rows, selectors) => {
          return rows.map(row => {
            const rowData = {};
            for (const [k, sel] of Object.entries(selectors)) {
              const el = row.querySelector(sel);
              rowData[k] = el ? el.innerText.trim() : "";
            }
            return rowData;
          });
        }, edCfg.fields);

        profileData.education = edData
          .map(e => `${e.institution} |\t${e.city} |\t${e.specialty} |\t${e.number} |\t${e.dateStart}-${e.dateEnd}`)
          .join("\n");
      }

      // Experience
      if (config.profile.fields.experience) {
        const expCfg = config.profile.fields.experience;
        const expData = await page.$$eval(expCfg.listSelector, (rows, selectors) => {
          return rows.map(row => {
            const rowData = {};
            for (const [k, sel] of Object.entries(selectors)) {
              const el = row.querySelector(sel);
              rowData[k] = el ? el.innerText.trim() : "";
            }
            return rowData;
          });
        }, expCfg.fields);

        profileData.experience = expData
          .map(e => `${e.vessel} |\t${e.rank} |\t${e.dateStart}-${e.dateEnd} |\t${e.shipOwner} |\t${e.crewing}`)
          .join("\n");
      }

      // Save success
      profiles.push(profileData);
      completedProfiles.add(link);
      failedProfiles.delete(link); // remove from failed if previously failed

      fs.writeFileSync(progressFile, JSON.stringify({
        profiles,
        completedProfiles: Array.from(completedProfiles),
        failedProfiles: Array.from(failedProfiles)
      }, null, 2));

      console.log(`✅ Saved profile ${idx + 1}: ${link}`);
      await sleep(config.delayBetweenProfiles);
      await browser.close();
      return null;

    } catch (err) {
      console.error(`❌ Failed profile ${link} via ${proxyArg}:`, err.message);
      failedProfiles.add(link);

      fs.writeFileSync(progressFile, JSON.stringify({
        profiles,
        completedProfiles: Array.from(completedProfiles),
        failedProfiles: Array.from(failedProfiles)
      }, null, 2));

      await browser.close();
      return link;
    }
  };

  const scrapeBatch = async (links, iteration) => {
    const failed = [];
    for (let i = 0; i < links.length; i++) {
      const proxy = proxies[i % proxies.length];
      const fail = await scrapeProfile(links[i], proxy, i, links.length, iteration);
      if (fail) failed.push(fail);
    }
    return failed;
  };

  // Main loop with retries
  let toRetry = filteredLinks;
  let iteration = 1;

  while (toRetry.length > 0) {
    console.log(`\n🔁 Retry iteration ${iteration}, ${toRetry.length} profiles remaining...`);
    const stillFailed = await scrapeBatch(toRetry, iteration);
    if (stillFailed.length === toRetry.length) {
      console.warn(`⚠️ No progress in iteration ${iteration}, stopping retries.`);
      break;
    }
    toRetry = stillFailed;
    iteration++;
  }

  console.log(`\n💾 Final progress saved to ${progressFile}`);
  console.log(`Total scraped profiles: ${profiles.length}`);
  if (failedProfiles.size > 0) {
    console.warn(`⚠️ ${failedProfiles.size} profiles failed`);
  }

  return { profiles, completedProfiles: Array.from(completedProfiles), failedProfiles: Array.from(failedProfiles) };
};

// Example usage
const profiles = fs.existsSync("./progress_links_1.json")
  ? JSON.parse(fs.readFileSync("./progress_links_1.json", "utf8"))
  : [];

scrapeProfiles(profiles.profileLinks).catch((err) => {
  console.error("Error during profile scraping:", err);
});
