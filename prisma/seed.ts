import { v4 as uuid } from 'uuid';
import bcrypt from 'bcrypt';
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.HOSANA_DB_PRISMA_DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});
async function main() {

  const amazingGrace = await prisma.song.create({
    data: {
      id: uuid(),
      title: 'Amazing Grace',
      artist: 'John Newton',
      folderId: null,
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
      folderId: null,
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
      folderId: null,
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
