import type { IClock } from '../../../common/clock.js';
import type { ISender } from '../../../common/mediator/types.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IImageRepository } from '../../images/common/ports.js';
import type { IBackgroundCheckRepository, IGoalkeeperProfileRepository } from './ports.js';

/** What the goalkeeper's own background-check handlers need (admin spec 030). */
export interface BackgroundCheckDependencies {
  profiles: IGoalkeeperProfileRepository;
  checks: IBackgroundCheckRepository;
  /** To show each check's image. */
  images: IImageRepository;
  /** Stores and deletes images through the images feature (research.md §5 of feature 004). */
  sender: ISender;
  idGenerator: IIdGenerator;
  clock: IClock;
}
