import {testProcessProject} from '../generate';

testProcessProject(
  'removes existing .guard.ts files',
  {
    'test.guard.ts': `/* WARNING: Do not manually change this file. */ alert("hello")`,
  },
  {}
)