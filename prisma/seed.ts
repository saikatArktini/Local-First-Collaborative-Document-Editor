import { PrismaClient, Role, AuditAction } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { pbkdf2Sync, randomBytes } from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('Clearing database...');
  await prisma.auditLog.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.syncOperation.deleteMany();
  await prisma.documentMember.deleteMany();
  await prisma.document.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding users...');
  const alicePassword = hashPassword('password123');
  const bobPassword = hashPassword('password123');
  const charliePassword = hashPassword('password123');

  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'Alice Smith',
      passwordHash: alicePassword,
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      name: 'Bob Jones',
      passwordHash: bobPassword,
    },
  });

  const charlie = await prisma.user.create({
    data: {
      email: 'charlie@example.com',
      name: 'Charlie Brown',
      passwordHash: charliePassword,
    },
  });

  console.log('Seeding documents...');
  // 1. Shared Project Plan (Alice is owner, Bob is editor, Charlie is viewer)
  const sharedPlan = await prisma.document.create({
    data: {
      title: 'Shared Project Plan',
      ownerId: alice.id,
    },
  });

  await prisma.documentMember.createMany({
    data: [
      {
        userId: alice.id,
        documentId: sharedPlan.id,
        role: Role.OWNER,
      },
      {
        userId: bob.id,
        documentId: sharedPlan.id,
        role: Role.EDITOR,
      },
      {
        userId: charlie.id,
        documentId: sharedPlan.id,
        role: Role.VIEWER,
      },
    ],
  });

  // Save the base state of the shared plan as the first version snapshot
  await prisma.documentVersion.create({
    data: {
      documentId: sharedPlan.id,
      snapshot: Buffer.from('Initial document text state'),
      createdBy: alice.id,
    },
  });

  // 2. Alice's Private Notes (Alice is owner)
  const aliceNotes = await prisma.document.create({
    data: {
      title: "Alice's Private Notes",
      ownerId: alice.id,
    },
  });

  await prisma.documentMember.create({
    data: {
      userId: alice.id,
      documentId: aliceNotes.id,
      role: Role.OWNER,
    },
  });

  await prisma.documentVersion.create({
    data: {
      documentId: aliceNotes.id,
      snapshot: Buffer.from('My top secret thoughts...'),
      createdBy: alice.id,
    },
  });

  // 3. Bob's Ideas (Bob is owner)
  const bobIdeas = await prisma.document.create({
    data: {
      title: "Bob's Ideas",
      ownerId: bob.id,
    },
  });

  await prisma.documentMember.create({
    data: {
      userId: bob.id,
      documentId: bobIdeas.id,
      role: Role.OWNER,
    },
  });

  await prisma.documentVersion.create({
    data: {
      documentId: bobIdeas.id,
      snapshot: Buffer.from('A list of neat features for our editor'),
      createdBy: bob.id,
    },
  });

  console.log('Seeding document changes/history...');
  // Add some change history to the shared document
  await prisma.syncOperation.create({
    data: {
      documentId: sharedPlan.id,
      clientId: 'alice-client-1',
      version: 1,
      operation: Buffer.from('Alice created the plan outline.'),
    },
  });

  await prisma.syncOperation.create({
    data: {
      documentId: sharedPlan.id,
      clientId: 'bob-client-1',
      version: 2,
      operation: Buffer.from('Bob added milestones and tasks.'),
    },
  });

  console.log('Seeding audit logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        userId: alice.id,
        action: AuditAction.DOCUMENT_CREATED,
        documentId: sharedPlan.id,
        metadata: { title: 'Shared Project Plan' },
      },
      {
        userId: alice.id,
        action: AuditAction.DOCUMENT_CREATED,
        documentId: aliceNotes.id,
        metadata: { title: "Alice's Private Notes" },
      },
      {
        userId: bob.id,
        action: AuditAction.DOCUMENT_CREATED,
        documentId: bobIdeas.id,
        metadata: { title: "Bob's Ideas" },
      },
      {
        userId: bob.id,
        action: AuditAction.SNAPSHOT_CREATED,
        documentId: sharedPlan.id,
        metadata: { note: 'Initial snapshot after seeding changes' },
      },
    ],
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // Make sure node process terminates
  });
