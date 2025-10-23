export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const filterLinksWithName = (links) => {
  return links.filter(link => {
    try {
      const url = new URL(link);
      const name = url.searchParams.get("name");
      return name && name.trim().length > 0;
    } catch {
      // skip invalid URLs
      return false;
    }
  });
};