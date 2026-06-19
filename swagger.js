import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'CySCOM OpenSource API',
    description: 'API for CySCOM Events Hub, Main Website, and Portals.',
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
