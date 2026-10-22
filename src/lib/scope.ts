/** Kayıt düzeyinde erişim: dış kullanıcı yalnız taraf olduğu işleri görür (sunucuda denetlenir). */
export interface OpParties { requesterPartyId: string | null; billingPartyId: string | null; guarantorPartyId: string | null; agentPartyId: string | null }

export function canSeeOperation(scope: { external: boolean; partyId: string | null }, p: OpParties): boolean {
  if (!scope.external) return true;
  if (!scope.partyId) return false;
  return [p.requesterPartyId, p.billingPartyId, p.guarantorPartyId, p.agentPartyId].includes(scope.partyId);
}
