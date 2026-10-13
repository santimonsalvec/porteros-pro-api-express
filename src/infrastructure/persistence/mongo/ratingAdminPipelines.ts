import type { Document } from 'mongodb';
import type { RatingListFilter } from '../../../application/features/ratings/common/adminPorts.js';

/**
 * The `find` filter of the admin's rating list (admin spec 006, research §10). A person filter
 * matches both what they wrote and what they received: the client rates on side `client`, the
 * goalkeeper on side `goalkeeper` (indexes `author_created` and `subject_side`).
 */
export function ratingsMatch(filter: RatingListFilter): Document {
  const match: Document = {};
  const people: Document[] = [];
  if (filter.goalkeeperId) people.push({ $or: [{ authorId: filter.goalkeeperId, side: 'goalkeeper' }, { subjectId: filter.goalkeeperId, side: 'client' }] });
  if (filter.clientId) people.push({ $or: [{ authorId: filter.clientId, side: 'client' }, { subjectId: filter.clientId, side: 'goalkeeper' }] });
  if (people.length > 0) match.$and = people;
  if (filter.side) match.side = filter.side;
  if (filter.starsMin !== undefined || filter.starsMax !== undefined) {
    match.stars = { ...(filter.starsMin !== undefined ? { $gte: filter.starsMin } : {}), ...(filter.starsMax !== undefined ? { $lte: filter.starsMax } : {}) };
  }
  if (filter.from || filter.to) {
    match.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lt: filter.to } : {}) };
  }
  return match;
}
