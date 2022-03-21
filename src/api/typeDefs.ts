export const KeycloakTypeDefs = `directive @hasRole(role: [String]) on FIELD | FIELD_DEFINITION
directive @auth on FIELD | FIELD_DEFINITION
directive @authKey on FIELD | FIELD_DEFINITION
directive @hasPermission(resources: [String]) on FIELD | FIELD_DEFINITION
directive @tenant(master: Boolean, realmFromContext: Boolean) on FIELD | FIELD_DEFINITION
`;
