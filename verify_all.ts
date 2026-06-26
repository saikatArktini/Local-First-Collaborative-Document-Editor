import { spawn } from 'child_process';

const testFiles = [
  'verify_errors.ts',
  'verify_audit.ts',
  'verify_tenant.ts',
  'verify_version.ts',
  'verify_websocket.ts',
  'verify_api_security.ts',
  'verify_auth.ts',
  'verify_sync.ts',
  'verify_rbac.ts',
  'verify_membership.ts',
  'verify_crud.ts',
  'verify_crdt.ts'
];

async function runTest(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n--------------------------------------------------`);
    console.log(`Running: ${file}`);
    console.log(`--------------------------------------------------`);
    
    const child = spawn('npx', ['tsx', file], { stdio: 'inherit', shell: true });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\nResult for ${file}: SUCCESS`);
        resolve(true);
      } else {
        console.error(`\nResult for ${file}: FAILED (exit code: ${code})`);
        resolve(false);
      }
    });
  });
}

async function runAll() {
  console.log('=== Starting Master Verification Suite ===');
  let overallPassed = true;
  for (const file of testFiles) {
    const passed = await runTest(file);
    if (!passed) {
      overallPassed = false;
    }
  }
  
  console.log(`\n==================================================`);
  if (overallPassed) {
    console.log('ALL TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED! ❌');
    process.exit(1);
  }
}

runAll().catch(e => {
  console.error('Unexpected error running test suite:', e);
  process.exit(1);
});
