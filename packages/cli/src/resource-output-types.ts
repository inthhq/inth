// Fields used by human output. Extra API fields remain available through --json.
export interface ScanDetails {
  id?: string;
  repositoryId?: string;
  repositoryName?: string | null;
  branch?: string | null;
  status?: string;
  access?: string;
  findingCount?: number | null;
  issueCount?: number | null;
  unlockCredits?: number | null;
  createdAt?: string | null;
  progress?: {
    stage: string;
    completedStages: number | null;
    totalStages: number | null;
  } | null;
}
export interface FindingDetails {
  id: string;
  title: string;
  priority?: string | null;
  description?: string | null;
  recommendation?: string | null;
  files?: string[];
}
export interface ResourceItem extends ScanDetails {
  name?: string;
  slug?: string;
  role?: string;
  email?: string;
  label?: string;
  organizationId?: string;
  description?: string | null;
  dashboardUrl?: string;
  consent?: {
    branding: string;
    trustedOrigins: string[];
    backendUrl: string | null;
  } | null;
  user?: { name: string; email: string };
  invitedBy?: { name: string; email: string };
  expiresAt?: string;
  prefix?: string | null;
  key?: string;
  owner?: string;
  defaultBranch?: string | null;
  visibility?: string;
  htmlUrl?: string;
  title?: string;
  summary?: string | null;
  priority?: string | null;
  source?: string;
  version?: string;
  githubIssue?: { number: number; url: string } | null;
  codeEvidence?: {
    filePath: string;
    lineNumbers: number[];
    recommendation: string | null;
  } | null;
  tier?: string;
  plan?: {
    name: string;
    billingInterval: string | null;
    pastDue: boolean;
  } | null;
  credits?: { remaining: number; unlimited: boolean } | null;
  autoTopUp?: {
    enabled: boolean;
    thresholdCredits: number | null;
    quantityCredits: number | null;
  } | null;
  preparationId?: string;
  scan?: ScanDetails;
  scanId?: string;
  totalCount?: number;
  lockedCount?: number;
  issues?: FindingDetails[];
  message?: string;
  deleted?: boolean;
  updated?: boolean;
}
export interface ResourcePage {
  success: boolean;
  data: ResourceItem[];
  pagination?: { hasMore: boolean; nextCursor: string | null };
}
export interface ResourceDetail {
  success: boolean;
  data: ResourceItem;
}
