-- Market Chat training: admin answers, taught words, and the inbox of unanswered questions.
CREATE TABLE "AssistantAnswer" (
    "id" TEXT NOT NULL,
    "questions" TEXT[],
    "answerLo" TEXT NOT NULL,
    "answerEn" TEXT NOT NULL,
    "productWords" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantWord" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "means" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantWord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssistantWord_word_key" ON "AssistantWord"("word");

CREATE TABLE "AssistantMiss" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMiss_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssistantMiss_text_key" ON "AssistantMiss"("text");
CREATE INDEX "AssistantMiss_resolved_lastAt_idx" ON "AssistantMiss"("resolved", "lastAt");
