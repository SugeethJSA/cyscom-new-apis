import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'CYSCOM OpenSource API',
    description: 'API for CYSCOM Main Website',
  },
  host: 'cyscom-new-apis.onrender.com',
  schemes: ['https', 'http'],
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      name: 'Authorization',
      in: 'header',
      description: 'Enter your bearer token in the format **Bearer <token>**'
    }
  },
  security: [ { bearerAuth: [] } ]
};

const outputFile = './swagger-output.json';
const routes = ['./server.js'];

swaggerAutogen()(outputFile, routes, doc);
