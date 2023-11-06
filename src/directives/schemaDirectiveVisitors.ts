import { defaultFieldResolver, GraphQLSchema } from 'graphql';
import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';

import {
  auth,
  authKey,
  hasPermission,
  hasRole,
  tenant,
} from './directiveResolvers';

export function AuthDirective(schema: GraphQLSchema, directiveName: any) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig: any) => {
      const authDirective = getDirective(schema, fieldConfig, directiveName)?.[0];
      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        fieldConfig.resolve = auth(resolve);
        return fieldConfig;
      }
    }
  })
}

export function AuthKeyDirective(schema: GraphQLSchema, directiveName: any) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig: any) => {
      const authKeyDirective = getDirective(schema, fieldConfig, directiveName)?.[0];
      if (authKeyDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        fieldConfig.resolve = authKey(resolve);
        return fieldConfig;
      }
    }
  })
}

export function TenantDirective(schema: GraphQLSchema, directiveName: any) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig: any) => {
      const teanantDirective = getDirective(schema, fieldConfig, directiveName)?.[0];
      if (teanantDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        fieldConfig.resolve = tenant(resolve);
        return fieldConfig;
      }
    }
  })
}

export function HasRoleDirective(schema: GraphQLSchema, directiveName: any) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig: any) => {
      const hasRoleDirective = getDirective(schema, fieldConfig, directiveName)?.[0];
      if (hasRoleDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        const roles = parseAndValidateArgsforhasRole(hasRoleDirective);
        fieldConfig.resolve = hasRole(roles)(resolve);
        return fieldConfig;
      }
    }
  })
}

/**
 *
 * validate a potential string or array of values
 * if an array is provided, cast all values to strings
 */
function parseAndValidateArgsforhasRole(args: { [name: string]: any }): Array<string> {
  const keys = Object.keys(args);
  if (keys.length === 1 && keys[0] === 'role') {
    const role = args[keys[0]];
    if (typeof role == 'string') {
      return [role];
    } else if (Array.isArray(role)) {
      return role.map((val) => String(val));
    } else {
      throw new Error(
        `invalid hasRole args. role must be a String or an Array of Strings`
      );
    }
  }
  throw Error("invalid hasRole args. must contain only a 'role argument");
}

export function HasPermissionDirective(schema: GraphQLSchema, directiveName: any) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig: any) => {
      const hasPermissionDirective = getDirective(schema, fieldConfig, directiveName)?.[0];
      if (hasPermissionDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        const resources = parseAndValidateArgsforhasPermission(hasPermissionDirective);
        fieldConfig.resolve = hasPermission(resources)(resolve);;
        return fieldConfig;
      }
    }
  })
}

/**
  *
  * validate a potential string or array of values
  * if an array is provided, cast all values to strings
  */
function parseAndValidateArgsforhasPermission(args: { [name: string]: any }): Array<string> {
  const keys = Object.keys(args);

  if (keys.length === 1 && keys[0] === 'resources') {
    const resources = args[keys[0]];
    if (typeof resources == 'string') {
      return [resources];
    } else if (Array.isArray(resources)) {
      return resources.map((val) => String(val));
    } else {
      throw new Error(
        `invalid hasPermission args. resources must be a String or an Array of Strings`
      );
    }
  }
  throw Error(
    "invalid hasPermission args. must contain only a 'resources argument"
  );
}
