# keycloak-connect-graphql-multirealm

A comprehensive solution for adding keycloak Authentication and Authorization to your Express based GraphQL server in an multi-realm setup to implement multi tenant applications.

This Keycloak GraphQL Multi-Realm adapter was created based on,
- keycloak-connect-graphql: https://github.com/aerogear/keycloak-connect-graphql
- keycloak-connect-multirealm: https://github.com/devsu/keycloak-nodejs-multirealm

Please refer those repositories for more documentation and usage aspects.

# Usage
## Installation

Install library 
```bash
npm install keycloak-connect keycloak-connect-graphql-multirealm
```

Install required dependencies:
```bash
npm install --save  graphql keycloak-connect apollo-server-express 
```

## Keycloak Multi-Realm Configuration

```javascript
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: true,
      store: memoryStore,
    })
  );

  const keycloak = new KeycloakMultiRealm(
    {
      store: memoryStore,
    },
    keycloakClientConfig as any
  );

  app.use(
    keycloak.middleware({
      admin: graphqlPath,
    })
  );

  app.use(graphqlPath, keycloak.middleware());
```

`KeycloakMultiRealm` can have optional functions: 
- `realmTenantMappingFunction?: ((tenantKey: string) => string) | undefined`
  
  This function can be used to convert tenantKey to realmName if the tenantKey is not equals to realmName.

```javacript
export function realmTenantMappingFunction(tenantKey: string) {
  if (!tenantKey) return undefined;
  else return `${tenantKey.toUpperCase()}-REALM`;
}
```

- `clientSecretResolverFunction?: ((realmName: string, clientId: string) => string) | undefined)`

  If @hasPermission Directive is used, you need to use confidential client in your `keycloakClientConfig`. But `ClientSecret` of each application would be different in each Realm. You can pass an Function to resolve `ClientSecret` based on the `realmName`.

```javascript
export const clientSecretResolverFunction = (realmName: string, clientId: string) => {
  const adminAccessToken = getToken(keycloakAdminConfig.realmName, keycloakAdminConfig.username, keycloakAdminConfig.password).access_token;
  const clientsResponse = request('GET', `${keycloakAdminConfig.baseUrl}/admin/realms/${realmName}/clients`, {
    qs: { clientId },
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
    },
  });
  const client = JSON.parse(clientsResponse.getBody('utf8'))[0];
  const secretResponse = request('GET', `${keycloakAdminConfig.baseUrl}/admin/realms/${realmName}/clients/${client.id}/client-secret`, {
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
    },
  });

  return JSON.parse(secretResponse.getBody('utf8')).value;
}
```
## Adding GraphQL Directives to Schema

Directive Transformers are available in `example/KeycloakDirectiveTransformers.ts`. 

```javascript
export function getSchema() {
  const federatedSchema = buildSubgraphSchema([{ typeDefs: mergeTypeDefs([typeDefs, gql(KeycloakTypeDefs)]) }]);

  let schema = addResolversToSchema({
    schema: federatedSchema,
    resolvers: mergeResolvers([resolvers]),
    inheritResolversFromInterfaces: true,
  });

  schema = authDirectiveTransformer(schema, 'auth');
  schema = authKeyDirectiveTransformer(schema, 'authKey');
  schema = tenantDirectiveTransformer(schema, 'tenant');
  schema = hasRoleDirectiveTransformer(schema, 'hasRole');
  schema = hasPermissionDirectiveTransformer(schema, 'hasPermission');

  return schema;
}
```
## Apollo Server Configuration

```javascript
  const server = new ApolloServer({
    schema: getSchema(),
    formatError: (err) => {
      if (!errorHandling.stacktrace) delete err.extensions.exception.stacktrace;
      return err;
    },
    context: async ({ req }) => {
      let tenantKey;
      if (req.headers['x-tenant-key']) {
        tenantKey = String(req.headers['x-tenant-key']);
      } else {
        tenantKey = req.originalUrl.replace(graphqlPath, ``).substring(1);
      }
      if (tenantKey == '') tenantKey = 'master';
      return {
        //@ts-ignore
        kauth: new MultiRealmKeycloakContext({ req }, keycloak, keycloakResourceServer),
        models: await getDatabaseModel(tenantKey),
        masterModels: database,
        tenantKey: tenantKey,
      };
    },
  });

  await server.start();
  server.applyMiddleware({
    app,
    path: graphqlPath,
  });
```

## Apollo Gateway Configuration

```javascript
class RequestDataSource extends RemoteGraphQLDataSource {
  willSendRequest = async ({ request, context }) => {
    if (context.tenantKey) {
      request.http?.headers.set("x-tenant-key", context.tenantKey);
    }
    if (context.req?.headers["authorization"]) {
      request.http?.headers.set("Authorization", context.req?.headers["authorization"]);
    }
  };
}

const gateway = new ApolloGateway({
  pollIntervalInMs: 10000,
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [], // provide serviceList [{name, url}]
  }),
  debug: true,
  buildService: ({ url }) => new RequestDataSource({ url }),
});
const server = new ApolloServer({
  gateway,
  context: ({ req }) => {
    let tenantKey;
    if (req.headers["x-tenant-key"]) {
      tenantKey = String(req.headers["x-tenant-key"]);
    } else {
      tenantKey = req.originalUrl.replace(graphqlPath, ``).substring(1);
    }
    return {
      req: req,
      tenantKey: tenantKey != "" ? tenantKey : "master",
    };
  },
  plugins: [ApolloServerPluginInlineTraceDisabled()],
});
await server.start();
server.applyMiddleware({
  app,
  path: `${graphqlPath}`,
});
```
