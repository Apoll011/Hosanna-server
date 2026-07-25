import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'leader@church.org';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ibav';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Tiago';

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: { id: uuid(), email: adminEmail, passwordHash, name: adminName, role: 'admin' },
  });
  console.log(`✔ Admin ready: ${adminEmail}`);

  await prisma.settings.upsert({
    where: { id: 'settings' },
    update: {},
    create: { id: 'settings' },
  });
  console.log('✔ Settings row ready');

  const existingFolders = await prisma.folder.count();
  if (existingFolders > 0) {
    console.log('… Sample content already present, skipping demo data seed.');
    return;
  }

  const hymns = await prisma.folder.create({ data: { id: uuid(), name: 'Hymns' } });
  const contemporary = await prisma.folder.create({ data: { id: uuid(), name: 'Contemporary' } });
  const worship = await prisma.folder.create({ data: { id: uuid(), name: 'Worship' } });

  const amazingGrace = await prisma.song.create({
    data: {
      id: uuid(),
      title: 'Amazing Grace',
      artist: 'John Newton',
      folderId: hymns.id,
      path: 'Hymns/Amazing Grace.pro',
      tags: ['Hymn', 'Classic', 'Grace'],
      content:
        '{title: Amazing Grace}\n{artist: John Newton}\n{key: G}\n{tempo: 72}\n\n' +
        '{c: Verse 1}\n[G]Amazing [C]grace, how [G]sweet the sound\n' +
        'That [G]saved a [D]wretch like [D7]me\n' +
        'I [G]once was [C]lost, but [G]now am found\nWas [G]blind but [D]now I [G]see',
    },
  });

  const howGreat = await prisma.song.create({
    data: {
      id: uuid(),
      title: 'How Great Is Our God',
      artist: 'Chris Tomlin',
      folderId: contemporary.id,
      path: 'Contemporary/How Great Is Our God.pro',
      tags: ['Contemporary', 'Worship', 'Praise'],
      content:
        '{title: How Great Is Our God}\n{artist: Chris Tomlin}\n{key: G}\n{tempo: 78}\n\n' +
        '{c: Chorus}\nHow [G]great is our God, sing with me\n' +
        'How [Em]great is our God, and all will see\nHow [C]great, how [D]great is our [G]God',
    },
  });

  await prisma.song.create({
    data: {
      id: uuid(),
      title: 'Way Maker',
      artist: 'Sinach',
      folderId: worship.id,
      path: 'Worship/Way Maker.pro',
      tags: ['Worship', 'Global'],
      content:
        '{title: Way Maker}\n{artist: Sinach}\n{key: G}\n{tempo: 68}\n\n' +
        '{c: Chorus}\n[C]Way maker, [G]miracle worker\n' +
        '[D]Promise keeper, [Em]light in the darkness\nMy God, that is who You [C]are',
    },
  });

  await prisma.service.create({
    data: {
      id: uuid(),
      name: 'Sunday Morning Service',
      date: new Date().toISOString().slice(0, 10),
      notes: "Focus on God's faithfulness.",
      songs: {
        create: [
          { songId: amazingGrace.id, position: 0, notes: 'Soft acoustic intro' },
          { songId: howGreat.id, position: 1, notes: 'Full band entrance' },
        ],
      },
    },
  });

  console.log('✔ Demo folders, songs and a service created');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
