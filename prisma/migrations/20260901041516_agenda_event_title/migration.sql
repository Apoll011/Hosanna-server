/*
  Warnings:

  - Added the required column `title` to the `agenda_events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "agenda_events" ADD COLUMN     "title" TEXT NOT NULL;
