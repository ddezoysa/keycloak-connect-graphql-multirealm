import { KeycloakMultiRealm } from './KeycloakMultiRealm';

import * as Keycloak from 'keycloak-connect';
import { GrantedRequest, KeycloakContextBase } from '../KeycloakContext';
import { AuthContextProvider } from '../api/AuthContextProvider';
import { AuthorizationConfiguration } from '../KeycloakPermissionsHandler';

export class MultiRealmKeycloakContext
  extends KeycloakContextBase
  implements AuthContextProvider
{
  public readonly request: GrantedRequest;
  public readonly accessToken: Keycloak.Token | undefined;
  private readonly authKey: string | undefined;
  token: any;

  constructor(
    { req }: { req: GrantedRequest },
    keycloak: KeycloakMultiRealm | undefined,
    authorizationConfiguration:
      | AuthorizationConfiguration
      | undefined = undefined
  ) {
    const token =
      req && req.kauth && req.kauth.grant
        ? req.kauth.grant.access_token
        : undefined;

    super(token, keycloak, authorizationConfiguration, req);
    this.request = req;
    this.authKey = keycloak?.getAuthKey();
  }

  public isKeyAuthenticated(): boolean {
    if (this.authKey) {
      return this.request.headers['x-auth-key'] == this.authKey;
    } else {
      return false;
    }
  }
}
