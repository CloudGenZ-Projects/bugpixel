/**
 * Inspector token service.
 *
 * Mints and validates the short-lived signed JWT that gates the injected
 * inspector. A token is minted only for a client with a valid session who owns
 * the target website; it is scoped to that website via the `aud` claim and
 * expires after INSPECTOR_TOKEN_TTL_SECONDS (~5 min).
 *
 * Validation succeeds if and only if ALL of the following hold (Property 11):
 *   - the token is present and validly signed with the server secret,
 *   - it is unexpired,
 *   - its `aud` equals the opened website id, and
 *   - it is backed by an active Owner_Session of the client who owns that
 *     website (session still valid AND the website is still owned by that user).
 * Every other case (no token, expired, wrong aud, bad signature, ended/absent
 * session, anonymous) is denied with INSPECTOR_DENIED.
 *
 * The signing secret is held server-side only and never leaves this service.
 *
 * Requirements: 5.1, 6.1, 6.2, 6.5, 6.6, 15.1, 15.2
 */
import jwt from "jsonwebtoken";

import { INSPECTOR_TOKEN_TTL_SECONDS } from "@crp/shared";
import type { OwnershipService } from "./ownershipService.js";
import type { SessionService } from "./sessionService.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { ServiceError } from "./serviceError.js";

/** The authenticated context in which a mint request is made. */
export interface MintContext {
  sessionId: string;
  userId: string;
}

export interface ValidateResult {
  ok: true;
  websiteId: string;
  userId: string;
}

export interface InspectorTokenService {
  /** Mint a token for the owning client + website. Throws if not permitted. */
  mint(ctx: MintContext, websiteId: string): { token: string; expiresIn: number };
  /**
   * Validate a token for a given opened website. Returns the result on success
   * or throws INSPECTOR_DENIED (403) in every failure case.
   */
  validate(token: string | undefined | null, websiteId: string): ValidateResult;
}

export function makeInspectorTokenService(
  secret: string,
  sessions: SessionService,
  ownership: OwnershipService,
  clock: Clock = systemClock,
  ttlSeconds: number = INSPECTOR_TOKEN_TTL_SECONDS
): InspectorTokenService {
  function denied(message = "Inspector activation denied."): never {
    throw new ServiceError("INSPECTOR_DENIED", 403, message);
  }

  return {
    mint(ctx, websiteId) {
      // Require a valid session and ownership of the target website.
      const session = sessions.get(ctx.sessionId);
      if (!session || session.userId !== ctx.userId) {
        denied("A valid owning-client session is required to mint a token.");
      }
      ownership.assertOwns(session.userId, websiteId);

      const nowSec = Math.floor(clock.now() / 1000);
      // Set iat/exp explicitly from the injected clock so expiry is
      // deterministic and testable (jsonwebtoken.sign otherwise uses real time).
      const payload = {
        sub: session.userId,
        sid: session.id,
        aud: websiteId,
        iat: nowSec,
        exp: nowSec + ttlSeconds,
      };
      const token = jwt.sign(payload, secret, { algorithm: "HS256" });
      return { token, expiresIn: ttlSeconds };
    },

    validate(token, websiteId) {
      if (!token) denied("No inspector token presented.");

      let decoded: { sub: string; sid: string; aud: string };
      try {
        decoded = jwt.verify(token, secret, {
          algorithms: ["HS256"],
          audience: websiteId,
          clockTimestamp: Math.floor(clock.now() / 1000),
        }) as unknown as { sub: string; sid: string; aud: string };
      } catch {
        // Bad signature, expired, or wrong audience all land here.
        denied("Inspector token is invalid, expired, or scoped to another website.");
      }

      // The token must be backed by an active Owner_Session for the owning
      // client, and that client must still own the website (Req 6.5, 6.6, 15.2).
      const session = sessions.get(decoded.sid);
      if (!session || session.userId !== decoded.sub) {
        denied("The owning-client session has ended or is no longer valid.");
      }
      if (!ownership.isOwner(session.userId, websiteId)) {
        denied("The client no longer owns this website.");
      }

      return { ok: true, websiteId, userId: session.userId };
    },
  };
}
