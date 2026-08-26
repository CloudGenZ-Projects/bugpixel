/**
 * Dependency container (v2 - no validator, no changeItems).
 */
import type { AppDatabase } from "./db/createDb.js";
import { makeRepositories, type Repositories } from "./db/repositories/index.js";
import {
  systemClock,
  type Clock,
  makeSessionService,
  makeAuthService,
  makeAuthzService,
  makeOwnershipService,
  makeInspectorTokenService,
  makeChangeRequestService,
  makeFileStore,
  makeRosterService,
  makeAssignmentService,
  makeListingService,
  makeWebsiteService,
  type SessionService,
  type AuthService,
  type AuthzService,
  type OwnershipService,
  type InspectorTokenService,
  type ChangeRequestService,
  type FileStore,
  type RosterService,
  type AssignmentService,
  type ListingService,
  type WebsiteService,
} from "./services/index.js";
import { makeR2FileStore, makeR2AsyncOps, type R2Config } from "./services/r2Store.js";

export interface ContainerConfig {
  db: AppDatabase;
  inspectorTokenSecret: string;
  storageRoot: string;
  clock?: Clock;
  bcryptRounds?: number;
  r2Config?: R2Config;
}

export interface Container {
  repos: Repositories;
  clock: Clock;
  sessions: SessionService;
  auth: AuthService;
  authz: AuthzService;
  ownership: OwnershipService;
  inspectorTokens: InspectorTokenService;
  changeRequests: ChangeRequestService;
  fileStore: FileStore;
  roster: RosterService;
  assignments: AssignmentService;
  listing: ListingService;
  websites: WebsiteService;
  csrfSecret: string;
  r2Ops: ReturnType<typeof makeR2AsyncOps> | null;
}

export function makeContainer(config: ContainerConfig): Container {
  const clock = config.clock ?? systemClock;
  const repos = makeRepositories(config.db);

  const fileStore = config.r2Config
    ? makeR2FileStore(config.r2Config)
    : makeFileStore(config.storageRoot);

  const r2Ops = config.r2Config ? makeR2AsyncOps(config.r2Config) : null;

  const sessions = makeSessionService(clock);
  const auth = makeAuthService(repos.users, sessions, config.bcryptRounds ?? 10);
  const authz = makeAuthzService();
  const ownership = makeOwnershipService(
    repos.websites,
    repos.changeRequests,
    repos.assignments
  );
  const inspectorTokens = makeInspectorTokenService(
    config.inspectorTokenSecret,
    sessions,
    ownership,
    clock
  );
  const changeRequests = makeChangeRequestService(repos, ownership, clock, fileStore);
  const roster = makeRosterService(repos.users, repos.assignments, sessions, clock);
  const assignments = makeAssignmentService(repos.users, repos.assignments, clock);
  const listing = makeListingService(repos, ownership);
  const websites = makeWebsiteService(repos);

  return {
    repos,
    clock,
    sessions,
    auth,
    authz,
    ownership,
    inspectorTokens,
    changeRequests,
    fileStore,
    roster,
    assignments,
    listing,
    websites,
    csrfSecret: config.inspectorTokenSecret,
    r2Ops,
  };
}
