import { defaultFieldResolver } from 'graphql';
import { mapSchema, getDirectives, MapperKind } from '@graphql-tools/utils';

import {
  auth as resolveAuth,
  hasRole as resolveHasRole,
  hasPermission as resolveHasPermission,
  tenant as resolveTenant,
} from '../src/directives/directiveResolvers';

export function authDirectiveTransformer(schema: any, directiveName = 'auth') {
  return mapSchema(schema, {
    // Executes once for each object field definition in the schema
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const deprecatedDirective = getDirectives(schema, fieldConfig, [
        directiveName,
      ])?.auth;
      if (deprecatedDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        fieldConfig.resolve = resolveAuth(resolve);
        return fieldConfig;
      }
    },
  });
}

export function tenantDirectiveTransformer(
  schema: any,
  directiveName = 'tenant'
) {
  return mapSchema(schema, {
    // Executes once for each object field definition in the schema
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const deprecatedDirective = getDirectives(schema, fieldConfig, [
        directiveName,
      ])?.tenant;
      if (deprecatedDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        const master = deprecatedDirective['master'];
        const realmFromContext = deprecatedDirective['realmFromContext'];
        fieldConfig.resolve = resolveTenant(master, realmFromContext)(resolve);
        return fieldConfig;
      }
    },
  });
}

// HasRoleDirective.parseAndValidateArgs
function parseAndValidateRoles(args: any) {
  const keys = Object.keys(args);
  if (keys.length === 1 && keys[0] === 'role') {
    const role = args[keys[0]];
    if (typeof role === 'string') return [role];
    if (Array.isArray(role)) return role.map((val) => String(val));
    throw new Error(
      `invalid hasRole args. role must be a String or an Array of Strings`
    );
  }
  throw Error("invalid hasRole args. must contain only a 'role argument");
}

export function hasRoleDirectiveTransformer(
  schema: any,
  directiveName = 'hasRole'
) {
  return mapSchema(schema, {
    // Executes once for each object field definition in the schema
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const deprecatedDirective = getDirectives(schema, fieldConfig, [
        directiveName,
      ])?.hasRole;
      if (deprecatedDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        const roles = parseAndValidateRoles(deprecatedDirective);
        fieldConfig.resolve = resolveHasRole(roles)(resolve);
        return fieldConfig;
      }
    },
  });
}

// HasPermissionDirective.parseAndValidateArgs
function parseAndValidateResources(args: any) {
  const keys = Object.keys(args);
  if (keys.length === 1 && keys[0] === 'resources') {
    const resources = args[keys[0]];
    if (typeof resources === 'string') return [resources];
    if (Array.isArray(resources)) return resources.map((val) => String(val));
    throw new Error(
      `invalid hasPermission args. resources must be a String or an Array of Strings`
    );
  }
  throw Error(
    "invalid hasPermission args. must contain only a 'resources argument"
  );
}

export function hasPermissionDirectiveTransformer(
  schema: any,
  directiveName = 'hasPermission'
) {
  return mapSchema(schema, {
    // Executes once for each object field definition in the schema
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const deprecatedDirective = getDirectives(schema, fieldConfig, [
        directiveName,
      ])?.hasPermission;
      if (deprecatedDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        const resources = parseAndValidateResources(deprecatedDirective);
        fieldConfig.resolve = resolveHasPermission(resources)(resolve);
        return fieldConfig;
      }
    },
  });
}
