import { startLegacyPlanner } from './legacy/runtime.js?v=20260909-engine-stability-v114';

// The migration starts by keeping the proven planner runtime intact behind a
// module boundary. Feature families move out one at a time in later commits.
startLegacyPlanner();
