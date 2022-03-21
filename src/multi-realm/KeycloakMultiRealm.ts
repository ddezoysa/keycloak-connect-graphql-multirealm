import { authKey } from './../directives/directiveResolvers';
import { KeycloakConfig, KeycloakOptions } from 'keycloak-connect';
const Keycloak = require('keycloak-connect');
const NodeCache = require('node-cache');
const composable = require('composable-middleware');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

import { getDefaultRealmNameFromTenant } from '../directives';

const Admin = require(path.join(
  process.cwd(),
  './node_modules/keycloak-connect/middleware/admin'
));
const Logout = require(path.join(
  process.cwd(),
  './node_modules/keycloak-connect/middleware/logout'
));
const PostAuth = require(path.join(
  process.cwd(),
  './node_modules/keycloak-connect/middleware/post-auth'
));
const GrantAttacher = require(path.join(
  process.cwd(),
  './node_modules/keycloak-connect/middleware/grant-attacher'
));
const Protect = require(path.join(
  process.cwd(),
  './node_modules/keycloak-connect/middleware/protect'
));

/**
 * We do not use clones because NodeCache throws exception
 * if the Keycloak is initiated with a non memory store(like redis-store).
 * Whenever keycloak is initialised with redis-store, the keycloak object contains
 * some deeply nested http connection objects, NodeCache fails because clone fails,
 * hence useClones is set to false.
 */
const cache = new NodeCache({ useClones: false });

const defaultOptions = {
  admin: '/',
  logout: '/logout',
};

export class KeycloakMultiRealm {
  config: KeycloakOptions;
  keycloakConfig: KeycloakConfig;
  realmTenantMappingFn: (tenantKey: string) => string;

  authKey: string | undefined = undefined;

  constructor(
    config: KeycloakOptions & { authKey: string | undefined },
    keycloakConfig: KeycloakConfig,
    public realmTenantMappingFunction?: (tenantKey: string) => string,
    public clientSecretResolverFunction?: (
      realmName: string,
      clientId: string
    ) => string
  ) {
    if (!config) {
      throw new Error('Adapter configuration must be provided.');
    }
    if (!realmTenantMappingFunction) {
      this.realmTenantMappingFn = getDefaultRealmNameFromTenant;
    } else {
      this.realmTenantMappingFn = realmTenantMappingFunction;
    }
    if (config.authKey) {
      this.authKey = config.authKey;
      delete config['authKey'];
    }

    this.config = config;

    this.keycloakConfig = this._getKeycloakConfig(keycloakConfig);
  }

  public getKeycloakConfig(): KeycloakConfig {
    return this.keycloakConfig;
  }

  public getAuthKey(): string | undefined {
    return this.authKey;
  }

  public middleware(customOptions?: { admin?: string; logout?: string }) {
    const options = Object.assign({}, defaultOptions, customOptions);
    return (req: any, res: any, next: any) => {
      const realm = this.getRealmName(req);
      if (!realm) {
        return next();
      }
      req.kauth = { realm };
      const keycloakObject = this.getKeycloakObjectForRealm(realm);
      /* eslint-disable new-cap */
      const middleware = composable(
        PostAuth(keycloakObject),
        Admin(keycloakObject, options.admin),
        GrantAttacher(keycloakObject),
        Logout(keycloakObject, options.logout)
      );
      /* eslint-enable new-cap */
      middleware(req, res, next);
    };
  }

  public protect(spec: any): (req: any, res: any, next: any) => void {
    return (req, res, next) => {
      const realm = this.getRealmName(req);
      if (!realm) {
        return this.accessDenied(req, res);
      }
      const keycloakObject = this.getKeycloakObjectForRealm(realm);
      // eslint-disable-next-line new-cap
      Protect(keycloakObject, spec)(req, res, next);
    };
  }

  getRealmName(req: any) {
    const token = this._decodeTokenString(this._getTokenStringFromRequest(req));
    if (
      token &&
      token.payload &&
      token.payload.iss &&
      token.payload.iss.startsWith(this.keycloakConfig['auth-server-url'])
    ) {
      return this.getRealmNameFromToken(token);
    }
    return this.getRealmNameFromRequest(req);
  }

  getRealmNameFromToken(token: any) {
    return token.payload.iss.split('/').pop();
  }

  /**
   * Method that should return the realm name for the given request.
   *
   * It will be called when the request doesn't have a valid token.
   *
   * By default it's empty, so it must be implemented by the user.
   * If not implemented, the admin and logout endpoints won't work.
   *
   * @param {Object} request The HTTP request.
   */
  // eslint-disable-next-line no-unused-vars
  getRealmNameFromRequest(req: any) {
    // should be implemented by user
  }

  public getKeycloakObjectFromReq(req: any) {
    return this.getKeycloakObjectForRealm(this.getRealmName(req));
  }
  /**
   * It creates a (or returns a cached) keycloak object for the given realm.
   *
   * @param {string} realm The realm name
   * @returns {Object} The keycloak object
   */
  public getKeycloakObjectForRealm(realm: any) {
    let keycloakObject = cache.get(realm);
    if (keycloakObject) {
      return keycloakObject;
    }

    const additionalConfig: any = { realm };

    if (this.clientSecretResolverFunction) {
      additionalConfig.credentials = {
        secret: this.clientSecretResolverFunction(
          realm,
          this.keycloakConfig.resource
        ),
      };
    }

    const keycloakConfig = Object.assign(
      {},
      this.keycloakConfig,
      additionalConfig
    );

    keycloakObject = new Keycloak(this.config, keycloakConfig);
    keycloakObject.authenticated = this.authenticated;
    keycloakObject.deauthenticated = this.deauthenticated;
    keycloakObject.accessDenied = this.accessDenied;
    cache.set(realm, keycloakObject);
    return keycloakObject;
  }

  /**
   * Replaceable function to handle access-denied responses.
   *
   * In the event the Keycloak middleware decides a user may
   * not access a resource, or has failed to authenticate at all,
   * this function will be called.
   *
   * By default, a simple string of "Access denied" along with
   * an HTTP status code for 403 is returned.  Chances are an
   * application would prefer to render a fancy template.
   */
  accessDenied(req: any, res: any) {
    res.status(403).send('Access Denied');
  }

  /**
   * Callback made upon successful authentication of a user.
   *
   * By default, this a no-op, but may assigned to another
   * function for application-specific login which may be useful
   * for linking authentication information from Keycloak to
   * application-maintained user information.
   *
   * The `request.kauth.grant` object contains the relevant tokens
   * which may be inspected.
   *
   * For instance, to obtain the unique subject ID:
   *
   *     request.kauth.grant.id_token.sub => bf2056df-3803-4e49-b3ba-ff2b07d86995
   *
   * @param {Object} request The HTTP request.
   */
  // eslint-disable-next-line no-unused-vars
  authenticated(req: any) {
    // no-op
  }

  /**
   * Callback made upon successful de-authentication of a user.
   *
   * By default, this is a no-op, but may be used by the application
   * in the case it needs to remove information from the user's session
   * or otherwise perform additional logic once a user is logged out.
   *
   * @param {Object} request The HTTP request.
   */
  // eslint-disable-next-line no-unused-vars
  deauthenticated(req: any) {
    // no-op
  }

  _getKeycloakConfig(keycloakConfig: KeycloakConfig) {
    if (typeof keycloakConfig === 'string') {
      return JSON.parse(fs.readFileSync(keycloakConfig));
    }
    if (keycloakConfig) {
      return keycloakConfig;
    }
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'keycloak.json'))
    );
  }

  _decodeTokenString(tokenString: any) {
    return jwt.decode(tokenString, { complete: true });
  }

  _getTokenStringFromRequest(req: any) {
    const authorization =
      req.headers.authorization || req.headers.Authorization;
    if (!authorization) {
      return;
    }
    if (authorization.toLowerCase().startsWith('bearer')) {
      return authorization.split(' ').pop();
    }
    return authorization;
  }
}
