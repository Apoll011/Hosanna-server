-- CreateIndex
CREATE INDEX "invitation_email_organizationId_idx" ON "invitation"("email", "organizationId");
