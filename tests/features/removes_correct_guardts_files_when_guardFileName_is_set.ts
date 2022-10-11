import {testProcessProject} from '../generate';

testProcessProject(
  'removes correct .guard.ts files when guardFileName is set',
  {
    'test.foo.ts': `/* WARNING: Do not manually change this file. */alert("hello")`,
    'test.guard.ts': `/* WARNING: Do not manually change this file. */alert("hello")`,
  },
  { 'test.guard.ts': null },
  { options: { guardFileName: 'foo' } }
)