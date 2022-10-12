import { testProcessProject } from '../generate'

testProcessProject(
  'Does not generate empty guard files',
  {
    'test.ts': '',
  },
  { 'test.ts': null }
)
