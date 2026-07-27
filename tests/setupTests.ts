import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only auto-registers its afterEach cleanup when vitest runs with
// `globals: true`. This suite imports its helpers explicitly instead, so without
// this the previous test's DOM stays mounted and role/text queries match twice.
afterEach(cleanup);
