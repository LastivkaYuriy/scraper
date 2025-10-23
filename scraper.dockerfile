FROM node:22.14.0

WORKDIR /scraper

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]