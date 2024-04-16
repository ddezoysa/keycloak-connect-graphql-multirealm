import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { mergeTypeDefs } from '@graphql-tools/merge';
import cors from "cors";
import express from 'express';
import gql from 'graphql-tag';
import {
  KeycloakContext,
  KeycloakTypeDefs
} from '../../dist/index';
import {
  AuthDirective,
  AuthKeyDirective,
  HasPermissionDirective,
  HasRoleDirective,
  TenantDirective,
} from '../../src/directives/schemaDirectiveVisitors';
import { configureKeycloak } from '../lib/common';
const { constraintDirective, constraintDirectiveTypeDefs } = require('graphql-constraint-directive')

const app = express()

const graphqlPath = '/graphql'

// perform the standard keycloak-connect middleware setup on our app
const { keycloak } = configureKeycloak(app, graphqlPath)

// Ensure entire GraphQL Api can only be accessed by authenticated users
app.use(graphqlPath, keycloak.protect())
app.use(cors());
const typeDefs = `
  type Query {
    hello: String @hasRole(role: "developer")
  }
`
const resolvers = {
  Query: {
    hello: (obj, args, context, info) => {
      // log some of the auth related info added to the context
      console.log(context.kauth.isAuthenticated())
      console.log(context.kauth.accessToken.content.preferred_username)

      const name = context.kauth.accessToken.content.preferred_username || 'world'
      return `Hello ${name}`
    }
  }
}

export interface IContext {
  kauth: KeycloakContext;
}

function convertToGraphQLResolverMap(iResolvers) {
  const graphQLResolvers = {};
  for (const type of Object.keys(iResolvers)) {
    graphQLResolvers[type] = {};
    for (const field of Object.keys(iResolvers[type])) {
      const resolverFunction = iResolvers[type][field];
      graphQLResolvers[type][field] = resolverFunction;
    }
  }
  return graphQLResolvers;
}

export function getSchema() {

  let schema = buildSubgraphSchema([{ typeDefs: mergeTypeDefs([constraintDirectiveTypeDefs, typeDefs, gql(KeycloakTypeDefs)]), resolvers: convertToGraphQLResolverMap(resolvers) }]);
  schema = AuthDirective(schema, 'auth');
  schema = AuthKeyDirective(schema, 'authKey');
  schema = TenantDirective(schema, 'tenant');
  schema = HasRoleDirective(schema, 'hasRole');
  schema = HasPermissionDirective(schema, 'hasPermission');
  schema = constraintDirective()(schema);

  return schema;
}

export async function startApolloServer() {
  const server = new ApolloServer<IContext>({
    schema: getSchema(),
    csrfPrevention: false,
    //TODO: Remove includeStacktraceInErrorResponses config after development
    includeStacktraceInErrorResponses: true,
  })


  app.use(
    graphqlPath,
    expressMiddleware(server, {
      context: async ({ req }) => {
        return {
          kauth: new KeycloakContext({ req: req as any })
        } as IContext
      }
    })

  )

  const port = 4000
  app.listen({ port }, () =>
    console.log(`🚀 Server ready at http://localhost:${port}${graphqlPath}`)
  )
}

startApolloServer();


