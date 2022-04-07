FROM node

WORKDIR /kanapi

COPY ./kanapi/package.json /kanapi/
RUN npm install

COPY ./kanapi /kanapi

EXPOSE 8000
CMD ["npm", "start"]