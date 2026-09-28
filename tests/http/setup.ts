import { afterEach } from 'vitest';
import { closeTestServers } from './testServers.js';

afterEach(closeTestServers);
