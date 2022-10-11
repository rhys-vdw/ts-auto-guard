import { testProcessProject } from '../generate'

const invalidGuardFileNameCharacters = ['*', '/']
for (const invalidCharacter of invalidGuardFileNameCharacters) {
  testProcessProject(
    `rejects invalid guardFileNames: ${invalidCharacter}`,
    {},
    {},
    {
      options: { guardFileName: `f${invalidCharacter}o` },
      throws: /guardFileName/,
    }
  )
}
