-- Live assist (docs/22): what a waiting run needs from the operator (no values).
ALTER TABLE "run" ADD COLUMN "attention" JSONB;
