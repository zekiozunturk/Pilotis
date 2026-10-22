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
  "PILOTAGE", "TOWAGE", "MOORING", "UNMOORING", "LINE_HANDLING", "CHARTER", "SALVAGE_REVIEW", "SPECIAL",
]);
export const eventType = pgEnum("event_type", [
  "TASK_ACCEPTED", "TRANSIT_START", "ARRIVED_SITE", "DECLARATION_CHECKED", "PILOT_BOARDED", "TUG_ALONGSIDE",
  "MOORING_START", "SERVICE_START", "PAUSE_START", "PAUSE_END", "SERVICE_END", "PILOT_DISEMBARKED",
  "INCIDENT", "CANCEL_OR_INCOMPLETE",
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
  createdAt: createdAt(), updatedAt: updatedAt(),
});

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
  title: text("title").notNull(),
  unit: text("unit"),
  managerId: text("manager_id"),
  workPhone: text("work_phone"),
  workEmail: text("work_email"),
  photoUrl: text("photo_url"),
  active: boolean("active").default(true).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
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
});

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

