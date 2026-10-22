// PILOTIS — Pilotage Integrated Logistics, Operations & Tariff Information System
// Yalova Pilotaj A.Ş. çekirdek veri modeli (Faz 0–1).
// Kurallar: zamanlar UTC (timestamptz); para alanları numeric; bilinmeyen değer = NULL (asla 0).
import {
  pgTable, pgEnum, text, integer, boolean, timestamp, numeric, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/id";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const ts = (n: string) => timestamp(n, { withTimezone: true });

// ───────────── ENUMS ─────────────
export const userRole = pgEnum("user_role", [
  "SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER", "PLANNER", "SHORE_OPS", "PILOT",
  "TUG_MASTER", "CREW", "ACCOUNTING", "TARIFF_OFFICER", "CUSTOMER", "BILLING_PARTY", "AUDITOR",
]);
export const partyKind = pgEnum("party_kind", ["COMPANY", "PERSON", "AUTHORITY"]);
export const partyRoleType = pgEnum("party_role_type", [
  "MINISTRY_DGM", "HARBOUR_MASTER", "COASTAL_SAFETY", "VTS", "COAST_GUARD", "SERVICE_PROVIDER",
  "AGENT", "OWNER", "OPERATOR_MANAGER", "CHARTERER", "MASTER", "SHIPYARD", "TERMINAL",
  "BILLING_PARTY", "PAYMENT_GUARANTOR", "SUBCONTRACTOR", "INSURER_PI_SURVEYOR", "EMERGENCY_AUTHORITY",
]);
export const facilityType = pgEnum("facility_type", [
  "SHIPYARD", "QUAY", "ANCHORAGE", "PILOT_STATION", "COASTAL_SAFETY_BASE", "OPERATOR_BASE", "OTHER",
]);
export const verification = pgEnum("verification", ["UNVERIFIED", "SOURCE_FOUND", "VERIFIED"]);
export const cargoCondition = pgEnum("cargo_condition", ["LADEN", "BALLAST", "EMPTY_NOT_CLEANED", "GAS_FREE", "UNKNOWN"]);
export const requestStatus = pgEnum("request_status", ["DRAFT", "SUBMITTED", "INFO_MISSING", "IN_REVISION", "ACCEPTED", "REJECTED"]);
export const approvalStatus = pgEnum("approval_status", ["AWAITING_DECLARATION", "AWAITING_BILLING_PARTY", "OPS_REVIEW", "COMPLETE"]);
export const planningStatus = pgEnum("planning_status", ["AWAITING_RESOURCE", "TENTATIVE", "FIRM", "REPLANNING"]);
export const opStatus = pgEnum("op_status", ["READY", "TRANSIT", "ON_SITE", "STARTED", "PAUSED", "COMPLETED", "PARTIAL", "CANCELLED"]);
export const accrualStatus = pgEnum("accrual_status", ["AWAITING_CALC", "IN_REVIEW", "APPROVED", "DISPUTED", "CORRECTED"]);
export const accountingStatus = pgEnum("accounting_status", ["AWAITING_EXPORT", "EXPORTED", "REJECTED", "INVOICED", "RECONCILED"]);
export const notifyStatus = pgEnum("notify_status", ["PREPARING", "READY", "AWAITING_SEND", "SENT", "ACCEPTED", "REJECTED"]);
export const billingDecision = pgEnum("billing_decision", ["PENDING", "APPROVED", "REJECTED"]);
export const declarationLayer = pgEnum("declaration_layer", ["CUSTOMER_DECLARED", "FIELD_VERIFIED", "APPROVED_FINAL"]);
export const serviceKind = pgEnum("service_kind", [
  "PILOTAGE", "TOWAGE", "MOORING", "UNMOORING", "LINE_HANDLING", "CHARTER", "SALVAGE_REVIEW", "SPECIAL", "STANDBY_TUG",
]);
export const eventType = pgEnum("event_type", [
  "TASK_ACCEPTED", "TRANSIT_START", "ARRIVED_SITE", "DECLARATION_CHECKED", "PILOT_BOARDED", "TUG_ALONGSIDE",
  "MOORING_START", "SERVICE_START", "PAUSE_START", "PAUSE_END", "SERVICE_END", "PILOT_DISEMBARKED",
  "INCIDENT", "CANCEL_OR_INCOMPLETE",
  "WAIT_START", "WAIT_END", "RETURN_START", "RETURN_END",
]);
export const assetType = pgEnum("asset_type", [
  "TUG", "PILOT_BOAT", "MOORING_BOAT", "SURFACE_CLEANING_VESSEL", "LAND_VEHICLE", "EQUIPMENT",
]);
export const ruleStatus = pgEnum("rule_status", ["DRAFT", "SOURCE_FOUND", "EXPERT_REVIEW", "APPROVED", "IN_FORCE", "REPEALED"]);
export const ruleLabel = pgEnum("rule_label", ["REGULATION", "CONTRACT", "OPERATING_PRACTICE", "INTL_GOOD_PRACTICE"]);
export const tariffFamilyKind = pgEnum("tariff_family_kind", ["MINISTRY", "KEGM", "CHARTER", "SALVAGE", "SPECIAL_CONTRACT"]);
export const signatureLevel = pgEnum("signature_level", ["QUALIFIED_E_SIGNATURE", "DRAWN", "OTP_ACCOUNT", "WET_UPLOADED", "NONE"]);

// ───────────── KİMLİK & DENETİM ─────────────
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  roles: userRole("roles").array().notNull().default([]),
  partyId: text("party_id").references(() => parties.id),
  personnelId: text("personnel_id").unique().references(() => personnel.id),
  active: boolean("active").default(true).notNull(),
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  username: text("username").unique(),         // giriş adı (küçük harf)
  passwordHash: text("password_hash"),         // scrypt$N$tuz$özet — düz şifre asla saklanmaz
  title: text("title"),                        // unvan / görev (onaylarda görünür)
  phone: text("phone"),
  failedLogins: integer("failed_logins").default(0).notNull(),
  lockedUntil: ts("locked_until"),
  lastLoginAt: ts("last_login_at"),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

/** Oturumlar — çerezde rastgele belirteç, veritabanında yalnız özeti tutulur */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),                 // sha256(belirteç)
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [index("sess_user_idx").on(t.userId)]);

/** Dijital olarak kabul edilen metinler: hizmet sözleşmesi, KVKK aydınlatma vb. — sürümlü, yayınlanan sürüm değişmez */
export const contractTemplates = pgTable("contract_templates", {
  id: id(),
  code: text("code").notNull(),                // HIZMET_SOZLESMESI, KVKK_AYDINLATMA, BEYAN_TAAHHUDU
  version: integer("version").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),                // düz metin / basit işaretleme
  status: text("status").default("DRAFT").notNull(), // DRAFT | PUBLISHED | RETIRED
  effectiveFrom: ts("effective_from"),
  legalReviewed: boolean("legal_reviewed").default(false).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("ctpl_code_ver").on(t.code, t.version)]);

export const contractAcceptances = pgTable("contract_acceptances", {
  id: id(),
  templateId: text("template_id").notNull().references(() => contractTemplates.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  userId: text("user_id").references(() => users.id),
  signerName: text("signer_name").notNull(),
  signerTitle: text("signer_title"),
  textHash: text("text_hash").notNull(),       // kabul edilen metnin sha256 özeti
  method: text("method").default("CLICKWRAP").notNull(), // CLICKWRAP | DRAWN | E_SIGNATURE | WET_UPLOADED
  signatureImageKey: text("signature_image_key"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  acceptedAt: ts("accepted_at").defaultNow().notNull(),
  revokedAt: ts("revoked_at"),
}, (t) => [index("cacc_party_idx").on(t.partyId)]);

export const auditLog = pgTable("audit_log", {
  id: id(),
  at: ts("at").defaultNow().notNull(),
  actorId: text("actor_id"),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId)]);

// ───────────── TARAFLAR ─────────────
export const parties = pgTable("parties", {
  id: id(),
  kind: partyKind("kind").notNull(),
  legalName: text("legal_name").notNull(),
  shortName: text("short_name"),
  taxOffice: text("tax_office"),
  taxNumber: text("tax_number").unique(), // metin: baştaki sıfırlar korunur
  etaCode: text("eta_code").unique(),
  address: text("address"),
  city: text("city"),
  country: text("country").default("TR"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  registrationStatus: text("registration_status").default("ACTIVE").notNull(), // ACTIVE | PENDING_REVIEW (portaldan kendi kaydı) | SUSPENDED
  isDemo: boolean("is_demo").default(false).notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const partyRoles = pgTable("party_roles", {
  id: id(),
  partyId: text("party_id").notNull().references(() => parties.id),
  role: partyRoleType("role").notNull(),
  validFrom: ts("valid_from").defaultNow().notNull(),
  validTo: ts("valid_to"),
  note: text("note"),
}, (t) => [uniqueIndex("party_role_uq").on(t.partyId, t.role, t.validFrom)]);

export const facilities = pgTable("facilities", {
  id: id(),
  code: text("code").unique(),            // tesis kodu — aktarımda tekil anahtar
  name: text("name").notNull(),
  type: facilityType("type").notNull(),
  ownerPartyId: text("owner_party_id").references(() => parties.id),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lon: numeric("lon", { precision: 9, scale: 6 }),
  coordSource: text("coord_source"),
  verification: verification("verification").default("UNVERIFIED").notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

// ───────────── GEMİ & UĞRAK ─────────────
export const vessels = pgTable("vessels", {
  id: id(),
  imo: text("imo").unique(),
  altOfficialId: text("alt_official_id"),
  mmsi: text("mmsi"),
  callSign: text("call_sign"),
  name: text("name").notNull(),
  formerNames: text("former_names").array().notNull().default([]),
  flag: text("flag"),
  portOfRegistry: text("port_of_registry"),
  vesselType: text("vessel_type"),
  gt: numeric("gt", { precision: 12, scale: 2 }),
  nt: numeric("nt", { precision: 12, scale: 2 }),
  dwt: numeric("dwt", { precision: 12, scale: 2 }),
  loa: numeric("loa", { precision: 8, scale: 2 }),
  beam: numeric("beam", { precision: 8, scale: 2 }),
  draft: numeric("draft", { precision: 6, scale: 2 }),
  propulsion: text("propulsion"),
  thrusters: text("thrusters"),
  restrictions: text("restrictions"),
  isDemo: boolean("is_demo").default(false).notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const portCalls = pgTable("port_calls", {
  id: id(),
  ref: text("ref").notNull().unique(),
  vesselId: text("vessel_id").notNull().references(() => vessels.id),
  agentPartyId: text("agent_party_id").references(() => parties.id),
  lastPort: text("last_port"),
  nextPort: text("next_port"),
  isCabotage: boolean("is_cabotage"),
  cargoCondition: cargoCondition("cargo_condition").default("UNKNOWN").notNull(),
  cargoType: text("cargo_type"),
  dgClass: text("dg_class"),
  unNumber: text("un_number"),
  gasFreeCertAt: ts("gas_free_cert_at"),
  isLinerService: boolean("is_liner_service"),
  repairPurpose: text("repair_purpose"),
  eta: ts("eta"),
  etd: ts("etd"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: createdAt(),
});

// ───────────── OPERASYON ─────────────
export const operationTypes = pgTable("operation_types", {
  code: text("code").primaryKey(),
  nameTr: text("name_tr").notNull(),
  nameEn: text("name_en").notNull(),
  scope: text("scope"),
  startEvent: text("start_event"),
  endEvent: text("end_event"),
  requiredDocs: text("required_docs").array().notNull().default([]),
  serviceKinds: serviceKind("service_kinds").array().notNull().default([]),
  tariffFamilies: text("tariff_families").array().notNull().default([]),
  unit: text("unit"),
  notifiable: boolean("notifiable").default(true).notNull(),
});

export const opSeq = pgTable("op_seq", { year: integer("year").primaryKey(), last: integer("last").notNull() });

export const operations = pgTable("operations", {
  id: id(),
  ref: text("ref").notNull().unique(), // OP-2026-000123
  portCallId: text("port_call_id").notNull().references(() => portCalls.id),
  typeCode: text("type_code").notNull().references(() => operationTypes.code),
  fromFacilityId: text("from_facility_id").references(() => facilities.id),
  toFacilityId: text("to_facility_id").references(() => facilities.id),
  requestedAt: ts("requested_at"),
  plannedStart: ts("planned_start"),
  plannedEnd: ts("planned_end"),
  /** Normal görev | zorunlu görev (idare talimatı) | acil müdahale */
  priority: text("priority").default("NORMAL").notNull(),
  isAuthorityTask: boolean("is_authority_task").default(false).notNull(),
  // bağlantılı durum kümeleri
  requestStatus: requestStatus("request_status").default("DRAFT").notNull(),
  approvalStatus: approvalStatus("approval_status").default("AWAITING_DECLARATION").notNull(),
  planningStatus: planningStatus("planning_status").default("AWAITING_RESOURCE").notNull(),
  opStatus: opStatus("op_status").default("READY").notNull(),
  accrualStatus: accrualStatus("accrual_status").default("AWAITING_CALC").notNull(),
  accountingStatus: accountingStatus("accounting_status").default("AWAITING_EXPORT").notNull(),
  notifyStatus: notifyStatus("notify_status").default("PREPARING").notNull(),
  // talep eden ≠ fatura muhatabı ≠ ödeme taahhüdü (R-018)
  requesterPartyId: text("requester_party_id").references(() => parties.id),
  billingPartyId: text("billing_party_id").references(() => parties.id),
  guarantorPartyId: text("guarantor_party_id").references(() => parties.id),
  isDemo: boolean("is_demo").default(false).notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const billingApprovals = pgTable("billing_approvals", {
  id: id(),
  operationId: text("operation_id").notNull().unique().references(() => operations.id),
  billingPartyId: text("billing_party_id").notNull().references(() => parties.id),
  taxVerified: boolean("tax_verified").default(false).notNull(),
  authorizedPerson: text("authorized_person"),
  decision: billingDecision("decision").default("PENDING").notNull(),
  decidedAt: ts("decided_at"),
  approvedDocVersionId: text("approved_doc_version_id"),
  note: text("note"),
});

export const serviceRequests = pgTable("service_requests", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  version: integer("version").notNull(),
  layer: declarationLayer("layer").notNull(),
  payload: jsonb("payload").notNull(),
  createdById: text("created_by_id"),
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("sr_op_ver_uq").on(t.operationId, t.version)]);

export const serviceLines = pgTable("service_lines", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  kind: serviceKind("kind").notNull(),
  allocatedUnits: integer("allocated_units"), // tahsis edilen
  billableUnits: integer("billable_units"),   // ücretlendirilebilir (R-004, R-019)
  masterWrittenRequestDocId: text("master_written_request_doc_id"),
  status: opStatus("status").default("READY").notNull(),
  cancelReason: text("cancel_reason"),
});

export const timelineEvents = pgTable("timeline_events", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  serviceKind: serviceKind("service_kind"),
  assetId: text("asset_id").references(() => fleetAssets.id),
  type: eventType("type").notNull(),
  occurredAt: ts("occurred_at").notNull(),        // gerçek zaman — asla yuvarlanmaz
  deviceAt: ts("device_at"),                      // cihaz saati
  receivedAt: ts("received_at").defaultNow().notNull(), // sunucuya ulaşma
  clientEventId: text("client_event_id").unique(), // çevrimdışı idempotens
  reasonCode: text("reason_code"),
  responsible: text("responsible"),
  note: text("note"),
  supersedesId: text("supersedes_id"),
  createdById: text("created_by_id"),
}, (t) => [index("te_op_idx").on(t.operationId, t.occurredAt)]);

// ───────────── PERSONEL & FİLO ─────────────
export const personnel = pgTable("personnel", {
  id: id(),
  fullName: text("full_name").notNull(),
  staffNo: text("staff_no").unique(),     // sicil no — Excel aktarımında tekil anahtar (baştaki sıfırlar korunur)
  title: text("title").notNull(),
  unit: text("unit"),
  managerId: text("manager_id"),
  workPhone: text("work_phone"),
  workEmail: text("work_email"),
  photoUrl: text("photo_url"),
  active: boolean("active").default(true).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  workProfile: text("work_profile").default("STCW_MLC").notNull(), // çalışma/dinlenme kural profili
  crewRole: text("crew_role"), // KAPTAN, BASCARKCI, YAGCI, PIMCI, KILAVUZ, KIYI_OPS
  homeAssetId: text("home_asset_id"),
  rotationTeam: text("rotation_team"), // rotasyon ekip yuvası, ör. "T1-A" (planning.rotation modelindeki römorkör kimliği + ekip harfi)
  createdAt: createdAt(), updatedAt: updatedAt(),
});

/** KVKK özel nitelikli veri — ayrı tablo, ayrı yetki, erişim kaydı zorunlu (R-017) */
export const personnelSensitive = pgTable("personnel_sensitive", {
  personnelId: text("personnel_id").primaryKey().references(() => personnel.id),
  bloodType: text("blood_type"),
  legalBasis: text("legal_basis"),
  consentDocId: text("consent_doc_id"),
});

export const fleetAssets = pgTable("fleet_assets", {
  id: id(),
  name: text("name").notNull(),
  code: text("code").unique(),            // kısa kod: R1…R7
  siteName: text("site_name"),            // web sitesinde yayımlanan ad (eşleştirme için)
  type: assetType("type").notNull(),
  imo: text("imo"),
  mmsi: text("mmsi"),
  callSign: text("call_sign"),
  bollardPullT: numeric("bollard_pull_t", { precision: 6, scale: 2 }),
  loa: numeric("loa", { precision: 6, scale: 2 }),
  enginePowerKw: numeric("engine_power_kw", { precision: 8, scale: 1 }),
  buildYear: integer("build_year"),
  photoUrl: text("photo_url"),
  sourceUrl: text("source_url"),
  specVerified: boolean("spec_verified").default(false).notNull(),
  available: boolean("available").default(true).notNull(),
  restrictions: text("restrictions"),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const certificates = pgTable("certificates", {
  id: id(),
  personnelId: text("personnel_id").references(() => personnel.id),
  assetId: text("asset_id").references(() => fleetAssets.id),
  name: text("name").notNull(),
  number: text("number"),
  issuedAt: ts("issued_at"),
  expiresAt: ts("expires_at"),
});

export const assignments = pgTable("assignments", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  assetId: text("asset_id").references(() => fleetAssets.id),
  personnelId: text("personnel_id").references(() => personnel.id),
  roleOnTask: text("role_on_task"),
  from: ts("from").notNull(),
  to: ts("to").notNull(),
  firm: boolean("firm").default(false).notNull(),
});

// ───────────── MEVZUAT & TARİFE ─────────────
export const regulationSources = pgTable("regulation_sources", {
  id: id(),
  title: text("title").notNull(),
  issuer: text("issuer").notNull(),
  docNumber: text("doc_number"),
  officialUrl: text("official_url"),
  archiveHash: text("archive_hash"),
  publishedAt: ts("published_at"),
  effectiveFrom: ts("effective_from"),
  effectiveTo: ts("effective_to"),
  checkedBy: text("checked_by"),
  checkedAt: ts("checked_at"),
});

export const businessRules = pgTable("business_rules", {
  code: text("code").primaryKey(),
  title: text("title").notNull(),
  label: ruleLabel("label").notNull(),
  status: ruleStatus("status").default("DRAFT").notNull(),
  basis: text("basis"),
  modules: text("modules").array().notNull().default([]),
  sourceId: text("source_id").references(() => regulationSources.id),
  supersedes: text("supersedes"),
  testRefs: text("test_refs").array().notNull().default([]),
  updatedAt: updatedAt(),
});

export const tariffFamilies = pgTable("tariff_families", {
  id: id(),
  kind: tariffFamilyKind("kind").notNull(),
  name: text("name").notNull(),
});

export const tariffVersions = pgTable("tariff_versions", {
  id: id(),
  familyId: text("family_id").notNull().references(() => tariffFamilies.id),
  label: text("label").notNull(),
  validFrom: ts("valid_from").notNull(),
  validTo: ts("valid_to").notNull(),
  currency: text("currency").notNull(),
  status: ruleStatus("status").default("DRAFT").notNull(),
  definition: jsonb("definition").notNull(), // kademeler, yuvarlama, artırım/indirim
  sourceRuleCodes: text("source_rule_codes").array().notNull().default([]),
  approvedBy: text("approved_by"),
  approvedAt: ts("approved_at"),
  isDemo: boolean("is_demo").default(false).notNull(),
  parentVersionId: text("parent_version_id"),
  preparedBy: text("prepared_by"),
  submittedBy: text("submitted_by"),
  submittedAt: ts("submitted_at"),
  publishedBy: text("published_by"),
  publishedAt: ts("published_at"),
  changeNote: text("change_note"),
  rev: integer("rev").default(1).notNull(), // eşzamanlı düzenleme koruması
  createdAt: createdAt(),
});

export const refCaseSource = pgEnum("ref_case_source", ["INDEPENDENT_MANUAL", "OFFICIAL_EXAMPLE", "HISTORICAL_JOB"]);

/** Referans hesap vakaları: beklenen tutar bağımsız kaynaktan; motor çıktısından türetilemez. */
export const referenceCases = pgTable("reference_cases", {
  id: id(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  tariffVersionId: text("tariff_version_id").notNull().references(() => tariffVersions.id),
  source: refCaseSource("source").notNull(),
  input: jsonb("input").notNull(),
  expected: numeric("expected", { precision: 14, scale: 2 }).notNull(),
  working: text("working").notNull(),
  preparedBy: text("prepared_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("ref_case_ver_code_uq").on(t.tariffVersionId, t.code)]);

export const calculationResults = pgTable("calculation_results", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  kind: text("kind").notNull(), // ESTIMATE | QUOTE | FINAL
  tariffVersionId: text("tariff_version_id").notNull().references(() => tariffVersions.id),
  inputHash: text("input_hash").notNull(),
  inputs: jsonb("inputs").notNull(),
  breakdown: jsonb("breakdown").notNull(),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  productionEligible: boolean("production_eligible").default(false).notNull(),
  createdAt: createdAt(),
});

// ───────────── BELGE ─────────────
export const documentVersions = pgTable("document_versions", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  docType: text("doc_type").notNull(),
  version: integer("version").notNull(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key"),
  contentType: text("content_type").default("application/pdf").notNull(),
  sizeBytes: integer("size_bytes"),
  sha256: text("sha256"),
  sourceSnapshotHash: text("source_snapshot_hash"), // belgeyi üreten operasyon verisinin özeti
  origin: text("origin").default("GENERATED").notNull(), // GENERATED | UPLOADED_WET_SIGNED
  generatedBy: text("generated_by"),
  signature: signatureLevel("signature").default("NONE").notNull(),
  signedBy: text("signed_by"),
  signedAt: ts("signed_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("doc_op_type_ver_uq").on(t.operationId, t.docType, t.version)]);

/** Onay/imza her zaman belirli bir belge sürümüne bağlıdır. */
export const documentApprovals = pgTable("document_approvals", {
  id: id(),
  documentVersionId: text("document_version_id").notNull().references(() => documentVersions.id),
  partyId: text("party_id").references(() => parties.id),
  approverName: text("approver_name").notNull(),
  approverTitle: text("approver_title"),
  level: signatureLevel("level").notNull(),
  decision: billingDecision("decision").notNull(),
  signatureImageKey: text("signature_image_key"),
  userAgent: text("user_agent"),
  note: text("note"),
  decidedAt: ts("decided_at").defaultNow().notNull(),
});

export const cartStatus = pgEnum("cart_status", ["OPEN", "SUBMITTED", "ABANDONED"]);

/** Sepet: talep toplama alanı — kaynak rezervasyonu veya operasyon izni değildir. */
export const carts = pgTable("carts", {
  id: id(),
  partyId: text("party_id").notNull().references(() => parties.id),
  status: cartStatus("status").default("OPEN").notNull(),
  submittedAt: ts("submitted_at"),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const cartItems = pgTable("cart_items", {
  id: id(),
  cartId: text("cart_id").notNull().references(() => carts.id),
  vesselId: text("vessel_id").notNull().references(() => vessels.id),
  typeCode: text("type_code").notNull().references(() => operationTypes.code),
  fromFacilityId: text("from_facility_id").references(() => facilities.id),
  toFacilityId: text("to_facility_id").references(() => facilities.id),
  plannedStart: ts("planned_start").notNull(),
  declaration: jsonb("declaration").notNull(),
  billingPartyId: text("billing_party_id").references(() => parties.id),
  estimate: jsonb("estimate"),
  declarationSignedBy: jsonb("declaration_signed_by"), // { name, title, userId, at, textHash } — beyannamenin dijital onayı
  operationId: text("operation_id").references(() => operations.id),
  createdAt: createdAt(),
});

// ───────────── AÇIK KONULAR ─────────────
export const openIssues = pgTable("open_issues", {
  code: text("code").primaryKey(),
  topic: text("topic").notNull(),
  owner: text("owner").notNull(),
  document: text("document").notNull(),
  target: text("target").notNull(),
  module: text("module").notNull(),
  closed: boolean("closed").default(false).notNull(),
});


// ───────────── KUR & AYARLAR ─────────────
export const fxSource = pgEnum("fx_source", ["TCMB", "MANUAL"]);

/** Döviz kurları — 1 birim döviz kaç TL. Kaynak bülteni ile saklanır, üzerine yazılmaz. */
export const exchangeRates = pgTable("exchange_rates", {
  id: id(),
  currency: text("currency").notNull(),        // USD, EUR
  bulletinDate: text("bulletin_date").notNull(), // YYYY-MM-DD (TCMB bülten tarihi)
  bulletinNo: text("bulletin_no"),
  forexBuying: numeric("forex_buying", { precision: 14, scale: 6 }),
  forexSelling: numeric("forex_selling", { precision: 14, scale: 6 }),
  source: fxSource("source").notNull(),
  enteredBy: text("entered_by"),
  fetchedAt: ts("fetched_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("fx_cur_date_src_uq").on(t.currency, t.bulletinDate, t.source)]);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: updatedAt(),
});

// ───────────── PLANLAMA ─────────────
export const shiftCategory = pgEnum("shift_category", ["WORK", "STANDBY", "TRAINING", "LEAVE"]);
export const shiftStatus = pgEnum("shift_status", ["PLANNED", "CONFIRMED", "CANCELLED"]);

/** Vardiya / görev / izin kayıtları. Plan ve gerçekleşen ayrı statülerle; iptal edilen silinmez. */
export const shifts = pgTable("shifts", {
  id: id(),
  personnelId: text("personnel_id").notNull().references(() => personnel.id),
  category: shiftCategory("category").notNull(),
  status: shiftStatus("status").default("PLANNED").notNull(),
  startAt: ts("start_at").notNull(),
  endAt: ts("end_at").notNull(),
  assetId: text("asset_id").references(() => fleetAssets.id),
  operationId: text("operation_id").references(() => operations.id),
  note: text("note"),
  /** Kural ihlaline rağmen kaydedildiyse: yetkili, dayanak, gerekçe, etkilenen ihlaller, telafi planı */
  exception: jsonb("exception"),
  createdBy: text("created_by"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: createdAt(),
  // Gerçekleşen (fiilî) çalışma — planlanan aralıktan ayrı tutulur; onaysız kayıt "onay bekleyen" sayılır
  actualStartAt: ts("actual_start_at"),
  actualEndAt: ts("actual_end_at"),
  actualSource: text("actual_source"),          // OFFICIAL | MANUAL_CORRECTION | ESTIMATE
  approvedById: text("approved_by_id"),
  approvedAt: ts("approved_at"),
  overtimeReason: text("overtime_reason"),
  correctionReason: text("correction_reason"),
  origin: text("origin").default("MANUAL").notNull(), // MANUAL | ROTATION
}, (t) => [index("shift_person_time_idx").on(t.personnelId, t.startAt)]);

// ───────────── ANALİZ: FİİLÎ KATILIM, ARAÇ DURUMU, FİNANS, MALİYET ─────────────
/** Operasyona fiilî katılım aralığı (kişi veya araç). Plan = assignments; gerçekleşen = participations. */
export const participations = pgTable("participations", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  personnelId: text("personnel_id").references(() => personnel.id),
  assetId: text("asset_id").references(() => fleetAssets.id),
  roleOnTask: text("role_on_task"),
  from: ts("from").notNull(),
  to: ts("to").notNull(),
  source: text("source").default("OFFICIAL").notNull(), // OFFICIAL | MANUAL_CORRECTION | ESTIMATE
  approved: boolean("approved").default(false).notNull(),
  note: text("note"),
}, (t) => [index("part_op_idx").on(t.operationId), index("part_person_idx").on(t.personnelId, t.from), index("part_asset_idx").on(t.assetId, t.from)]);

/** Aracın kullanılamadığı süreler (bakım, arıza, belge) */
export const assetDowntime = pgTable("asset_downtime", {
  id: id(),
  assetId: text("asset_id").notNull().references(() => fleetAssets.id),
  kind: text("kind").notNull(), // PLANNED_MAINTENANCE | BREAKDOWN | CERTIFICATE | OTHER
  from: ts("from").notNull(),
  to: ts("to").notNull(),
  note: text("note"),
  createdBy: text("created_by"),
});

/** Günlük motor saati ve yakıt — ölçülen ve tahmini ayrı işaretlenir */
export const assetMeters = pgTable("asset_meters", {
  id: id(),
  assetId: text("asset_id").notNull().references(() => fleetAssets.id),
  day: text("day").notNull(),               // YYYY-MM-DD (TR)
  engineHours: numeric("engine_hours", { precision: 6, scale: 1 }),
  fuelLiters: numeric("fuel_liters", { precision: 9, scale: 1 }),
  fuelMeasured: boolean("fuel_measured").default(false).notNull(),
}, (t) => [uniqueIndex("meter_asset_day_uq").on(t.assetId, t.day)]);

/** Fatura / iade faturası — muhasebe sisteminden (ETA) aktarılır; fatura TL kesilir */
export const invoices = pgTable("invoices", {
  id: id(),
  number: text("number").notNull().unique(),
  kind: text("kind").default("INVOICE").notNull(), // INVOICE | CREDIT_NOTE
  partyId: text("party_id").notNull().references(() => parties.id),
  issueDate: text("issue_date").notNull(),         // YYYY-MM-DD
  currency: text("currency").default("TRY").notNull(),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),   // iade faturasında negatif
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").default("ISSUED").notNull(), // ISSUED | CANCELLED
  correctsInvoiceId: text("corrects_invoice_id"),
  disputedAmount: numeric("disputed_amount", { precision: 14, scale: 2 }).default("0").notNull(),
  disputeNote: text("dispute_note"),
  source: text("source").default("MANUAL").notNull(), // ETA_IMPORT | MANUAL | DEMO
  importBatchId: text("import_batch_id"),
  createdAt: createdAt(),
});

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  operationId: text("operation_id").references(() => operations.id),
  calcResultId: text("calc_result_id").references(() => calculationResults.id),
  serviceKind: text("service_kind"),
  description: text("description").notNull(),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull(),
}, (t) => [index("invline_op_idx").on(t.operationId)]);

export const payments = pgTable("payments", {
  id: id(),
  partyId: text("party_id").notNull().references(() => parties.id),
  receivedDate: text("received_date").notNull(),
  currency: text("currency").default("TRY").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reference: text("reference"),
  source: text("source").default("MANUAL").notNull(),
  importBatchId: text("import_batch_id"),
});

/** Tahsilat yalnız fatura eşleşmesiyle operasyona bağlanır */
export const paymentMatches = pgTable("payment_matches", {
  id: id(),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

/** Maliyet kayıtları: gerçekleşen / tahmini / dağıtılmış ayrı işaretlenir */
export const costEntries = pgTable("cost_entries", {
  id: id(),
  day: text("day").notNull(),            // YYYY-MM-DD
  category: text("category").notNull(),  // PERSONNEL | OVERTIME | FUEL | SUBCONTRACT | OP_SPECIFIC | MAINTENANCE | OVERHEAD
  nature: text("nature").notNull(),      // ACTUAL | ESTIMATE | ALLOCATED
  currency: text("currency").default("TRY").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  operationId: text("operation_id").references(() => operations.id),
  assetId: text("asset_id").references(() => fleetAssets.id),
  teamKey: text("team_key"),
  description: text("description"),
  allocationBasis: text("allocation_basis"),
  source: text("source").default("MANUAL").notNull(),
  importBatchId: text("import_batch_id"),
  sourceRef: text("source_ref").unique(),   // kaynak belge no — tekrar yüklemede mükerrer kayıt önlenir
});

/** Gerekçeli, yetkili onaylı elle gelir dağıtımı (doğrudan/süre/ağırlık yöntemlerinin yerine geçer) */
export const manualAllocations = pgTable("manual_allocations", {
  id: id(),
  invoiceLineId: text("invoice_line_id").notNull().references(() => invoiceLines.id),
  targetType: text("target_type").notNull(), // ASSET | PERSONNEL
  targetId: text("target_id").notNull(),
  sharePct: numeric("share_pct", { precision: 7, scale: 4 }).notNull(),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by").notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: createdAt(),
});

/** Plan–gerçekleşen sapma nedeni. Neden ve sorumluluk ayrı tutulur; sistem kimseyi otomatik sorumlu ilan etmez. */
export const deviations = pgTable("deviations", {
  id: id(),
  operationId: text("operation_id").notNull().references(() => operations.id),
  category: text("category").notNull(), // CUSTOMER_PREP | FACILITY_PREP | WEATHER | TECH_FAILURE | EMERGENCY_TASK | PLAN_CHANGE | DECLARATION_CHANGE | MISSING_INFO | OTHER
  minutes: integer("minutes"),
  note: text("note"),
  responsibilityNote: text("responsibility_note"),
  recordedBy: text("recorded_by"),
  recordedAt: createdAt(),
});

// ───────────── TERMİNOLOJİ ─────────────
/** Merkezî terim sözlüğü — numara değişmez; çeviriler insan onayı olmadan bağlayıcı değildir. */
export const terms = pgTable("terms", {
  number: integer("number").primaryKey(),
  slug: text("slug").notNull().unique(),
  tr: text("tr").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  definition: text("definition").notNull(),
  source: text("source"),
  confusedWith: text("confused_with"),
  translations: jsonb("translations").notNull(), // { en: {text, reviewed}, de, it, nb, ar }
  status: text("status").default("TASLAK").notNull(),
  version: integer("version").default(1).notNull(),
  updatedAt: updatedAt(),
});

// ───────────── RAPORLAR ─────────────
/** Rapor şablonu (düzen+alanlar), kayıtlı görünüm (filtre+kolon+sıralama), sabit nüsha (değişmez çıktı) ayrı türlerdir */
export const reports = pgTable("reports", {
  id: id(),
  kind: text("kind").notNull(),              // TEMPLATE | VIEW | SNAPSHOT
  name: text("name").notNull(),
  scope: text("scope").default("PERSONAL").notNull(), // PERSONAL | TEAM | CORPORATE
  owner: text("owner").notNull(),            // kullanıcı (geliştirmede rol)
  ownerRole: text("owner_role").notNull(),
  definition: jsonb("definition").notNull(), // ReportDef
  filters: text("filters"),                  // URL sorgu dizesi
  snapshot: jsonb("snapshot"),               // SNAPSHOT: üretilen satırlar + meta (değişmez)
  sourceId: text("source_id"),               // kopya / nüsha kaynağı
  version: integer("version").default(1).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const reportSchedules = pgTable("report_schedules", {
  id: id(),
  reportId: text("report_id").notNull().references(() => reports.id),
  frequency: text("frequency").notNull(),    // DAILY | WEEKLY | MONTHLY
  at: text("at").notNull(),                  // HH:MM (TR)
  weekday: integer("weekday"),
  recipients: jsonb("recipients").notNull(), // [{ email, role }]
  format: text("format").notNull(),          // XLSX | PDF
  dataScope: text("data_scope").notNull(),   // ör. "Son 7 gün", "Geçen ay"
  active: boolean("active").default(true).notNull(),
  lastRunAt: ts("last_run_at"),
  lastResult: text("last_result"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

// ───────────── EXCEL AKTARIM ─────────────
export const importBatches = pgTable("import_batches", {
  id: id(),
  no: text("no").notNull().unique(),          // AKT-20261022-XXXX
  entity: text("entity").notNull(),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  storageKey: text("storage_key").notNull(),
  sheet: text("sheet"),
  headerRow: integer("header_row"),
  mapping: jsonb("mapping"),                  // { kaynakKolon: hedefAlan }
  options: jsonb("options"),                  // { key, emptyCell, mode, formulas, target }
  status: text("status").default("UPLOADED").notNull(), // UPLOADED | VALIDATED | AWAITING_APPROVAL | RUNNING | DONE | DRY_RUN | FAILED | REVERTED | PARTIALLY_REVERTED
  summary: jsonb("summary"),
  progress: integer("progress").default(0).notNull(),
  total: integer("total").default(0).notNull(),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  message: text("message"),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
});
export const importRows = pgTable("import_rows", {
  id: id(),
  batchId: text("batch_id").notNull().references(() => importBatches.id),
  rowNo: integer("row_no").notNull(),
  action: text("action").notNull(),           // INSERT | UPDATE | SKIP | ERROR
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  errors: jsonb("errors"),
  warnings: jsonb("warnings"),
  appliedAt: ts("applied_at"),
  revertNote: text("revert_note"),
}, (t) => [index("improw_batch_idx").on(t.batchId, t.rowNo)]);
export const importMappings = pgTable("import_mappings", {
  id: id(),
  entity: text("entity").notNull(),
  name: text("name").notNull(),
  profile: text("profile"),                   // kaynak sistem: ETA, eski portal, elle…
  mapping: jsonb("mapping").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("impmap_uq").on(t.entity, t.name)]);
