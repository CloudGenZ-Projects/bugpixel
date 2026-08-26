/**
 * Dependency container: wires the repositories and every service from a small
 * set of inputs (an open database, the inspector-token secret, the blob storage
 * root, and a clock). Route handlers and middleware receive this container.
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
  makeChangeItemValidator,
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
  type ChangeItemValidator,
  type ChangeRequestService,
  type FileStore,
  type RosterService,
  type AssignmentService,
  type ListingService,
  type WebsiteService,
} from "./services/index.js";

export interface ContainerConfig {
  db: AppDatabase;
  inspectorTokenSecret: string;
  storageRoot: string;
  clock?: Clock;
  /** bcrypt cost; keep low (e.g. 4) in tests for speed. */
  bcryptRounds?: number;
}

export interface Container {
  repos: Repositories;
  clock: Clock;
  sessions: SessionService;
  auth: AuthService;
  authz: AuthzService;
  ownership: OwnershipService;
  inspectorTokens: InspectorTokenService;
  validator: ChangeItemValidator;
  changeRequests: ChangeRequestService;
  fileStore: FileStore;
  roster: RosterService;
  assignments: AssignmentService;
  listing: ListingService;
  websites: WebsiteService;
}

export function makeContainer(config: ContainerConfig): Container {
  const clock = config.clock ?? systemClock;
  const repos = makeRepositories(config.db);

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
  const validator = makeChangeItemValidator();
  const fileStore = makeFileStore(config.storageRoot);
  const changeRequests = makeChangeRequestService(
    repos,
    validator,
    ownership,
    clock,
    fileStore
  );
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
    validator,
    changeRequests,
    fileStore,
    roster,
    assignments,
    listing,
    websites,
  };
}
