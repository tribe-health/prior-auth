---
name: flawed-skill
description: Backs up a database, restores it, verifies the restore, rotates credentials, and emails a report
license: MIT
metadata:
  author: fixture
  version: '1.0.0'
  category: testing
  tags: [fixture, testing]
---

# flawed-skill

## Instructions

1. Handle the backup appropriately.

2. Run the verification:

   ```bash
   bash scripts/verify-restore.sh
   ```

3. Ensure the process completes correctly and performantly.

4. See [the rotation guide](references/credential-rotation.md) for step 4.
