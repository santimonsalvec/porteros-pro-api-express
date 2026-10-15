import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { ISender } from '../application/common/mediator/types.js';
import type { IUserRepository } from '../application/features/auth/common/ports.js';
import type { IImageRepository } from '../application/features/images/common/ports.js';
import type { IRatingRepository } from '../application/features/ratings/common/ports.js';
import type { IStaffMemberRepository } from '../application/features/staff/common/ports.js';
import type { ICityRepository } from '../application/features/locations/common/ports.js';
import type { IUserAdminReader, IUserBlockRepository } from '../application/features/users/common/ports.js';
import { VerifyGoalkeeperCommand } from '../application/features/goalkeepers/commands/verifyGoalkeeper/verifyGoalkeeperCommand.js';
import { VerifyGoalkeeperCommandHandler } from '../application/features/goalkeepers/commands/verifyGoalkeeper/verifyGoalkeeperCommandHandler.js';
import { UploadVerificationEvidenceCommand } from '../application/features/goalkeepers/commands/uploadVerificationEvidence/uploadVerificationEvidenceCommand.js';
import { UploadVerificationEvidenceCommandHandler } from '../application/features/goalkeepers/commands/uploadVerificationEvidence/uploadVerificationEvidenceCommandHandler.js';
import { RevokeValidationCommand } from '../application/features/goalkeepers/commands/revokeValidation/revokeValidationCommand.js';
import { RevokeValidationCommandHandler } from '../application/features/goalkeepers/commands/revokeValidation/revokeValidationCommandHandler.js';
import { RevokeVerificationCommand } from '../application/features/goalkeepers/commands/revokeVerification/revokeVerificationCommand.js';
import { RevokeVerificationCommandHandler } from '../application/features/goalkeepers/commands/revokeVerification/revokeVerificationCommandHandler.js';
import { ListReferrerOptionsQuery } from '../application/features/goalkeepers/queries/listReferrerOptions/listReferrerOptionsQuery.js';
import { ListReferrerOptionsQueryHandler } from '../application/features/goalkeepers/queries/listReferrerOptions/listReferrerOptionsQueryHandler.js';
import type { VettingDependencies } from '../application/features/goalkeepers/common/vettingDependencies.js';
import { UploadBackgroundCheckCommand } from '../application/features/goalkeepers/commands/uploadBackgroundCheck/uploadBackgroundCheckCommand.js';
import { UploadBackgroundCheckCommandHandler } from '../application/features/goalkeepers/commands/uploadBackgroundCheck/uploadBackgroundCheckCommandHandler.js';
import { DeleteBackgroundCheckCommand } from '../application/features/goalkeepers/commands/deleteBackgroundCheck/deleteBackgroundCheckCommand.js';
import { DeleteBackgroundCheckCommandHandler } from '../application/features/goalkeepers/commands/deleteBackgroundCheck/deleteBackgroundCheckCommandHandler.js';
import { ListMyBackgroundChecksQuery } from '../application/features/goalkeepers/queries/listMyBackgroundChecks/listMyBackgroundChecksQuery.js';
import { ListMyBackgroundChecksQueryHandler } from '../application/features/goalkeepers/queries/listMyBackgroundChecks/listMyBackgroundChecksQueryHandler.js';
import { ReviewBackgroundCheckCommand } from '../application/features/goalkeepers/commands/reviewBackgroundCheck/reviewBackgroundCheckCommand.js';
import { ReviewBackgroundCheckCommandHandler } from '../application/features/goalkeepers/commands/reviewBackgroundCheck/reviewBackgroundCheckCommandHandler.js';
import { DecideValidationCommand } from '../application/features/goalkeepers/commands/decideValidation/decideValidationCommand.js';
import { DecideValidationCommandHandler } from '../application/features/goalkeepers/commands/decideValidation/decideValidationCommandHandler.js';
import { GetGoalkeeperVettingQuery } from '../application/features/goalkeepers/queries/getGoalkeeperVetting/getGoalkeeperVettingQuery.js';
import { GetGoalkeeperVettingQueryHandler } from '../application/features/goalkeepers/queries/getGoalkeeperVetting/getGoalkeeperVettingQueryHandler.js';

/** What the validation and verification handlers read and write (admin spec 030). */
export interface GoalkeeperVettingHandlerDependencies extends VettingDependencies {
  images: IImageRepository;
  /** Stores and deletes images through the images feature. */
  sender: ISender;
  staff: Pick<IStaffMemberRepository, 'findByUserId'>;
  users: Pick<IUserRepository, 'getByIds'>;
  ratings: Pick<IRatingRepository, 'summaryForGoalkeeper'>;
  blocks: Pick<IUserBlockRepository, 'findByUserId' | 'findByUserIds'>;
  /** The name search of the referrer picker. */
  userReader: Pick<IUserAdminReader, 'findIds'>;
  cities: Pick<ICityRepository, 'getByIds'>;
  /** Verifies by reputation right after a validation (research §7). */
  reputation: { evaluate(goalkeeperId: string): Promise<unknown> };
}

/**
 * The goalkeeper's and the admin web's validation and verification handlers, shared by the
 * composition root and the HTTP tests' fake-backed one so both register exactly the same set.
 */
export function goalkeeperVettingHandlerRegistrations(deps: GoalkeeperVettingHandlerDependencies): HandlerRegistration[] {
  return [
    { requestType: UploadBackgroundCheckCommand, handler: new UploadBackgroundCheckCommandHandler(deps) },
    { requestType: DeleteBackgroundCheckCommand, handler: new DeleteBackgroundCheckCommandHandler(deps) },
    { requestType: ListMyBackgroundChecksQuery, handler: new ListMyBackgroundChecksQueryHandler(deps) },
    { requestType: ReviewBackgroundCheckCommand, handler: new ReviewBackgroundCheckCommandHandler(deps) },
    { requestType: DecideValidationCommand, handler: new DecideValidationCommandHandler(deps) },
    { requestType: GetGoalkeeperVettingQuery, handler: new GetGoalkeeperVettingQueryHandler(deps) },
    { requestType: VerifyGoalkeeperCommand, handler: new VerifyGoalkeeperCommandHandler(deps) },
    { requestType: UploadVerificationEvidenceCommand, handler: new UploadVerificationEvidenceCommandHandler(deps) },
    { requestType: ListReferrerOptionsQuery, handler: new ListReferrerOptionsQueryHandler(deps) },
    { requestType: RevokeValidationCommand, handler: new RevokeValidationCommandHandler(deps) },
    { requestType: RevokeVerificationCommand, handler: new RevokeVerificationCommandHandler(deps) },
  ];
}
