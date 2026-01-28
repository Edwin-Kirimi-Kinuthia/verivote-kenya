-- CreateEnum
CREATE TYPE "VoterStatus" AS ENUM ('REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VoteStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SUPERSEDED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "PrintStatus" AS ENUM ('PENDING', 'PRINTING', 'PRINTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "voters" (
    "id" UUID NOT NULL,
    "national_id" VARCHAR(20) NOT NULL,
    "sbt_address" VARCHAR(66),
    "sbt_token_id" VARCHAR(78),
    "sbt_minted_at" TIMESTAMP(3),
    "pin_hash" VARCHAR(255),
    "distress_pin_hash" VARCHAR(255),
    "status" "VoterStatus" NOT NULL DEFAULT 'REGISTERED',
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "last_voted_at" TIMESTAMP(3),
    "polling_station_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "encrypted_vote_hash" VARCHAR(255) NOT NULL,
    "encrypted_vote_data" TEXT,
    "serial_number" VARCHAR(64) NOT NULL,
    "zkp_proof" TEXT,
    "blockchain_tx_hash" VARCHAR(66),
    "block_number" BIGINT,
    "confirmed_at" TIMESTAMP(3),
    "status" "VoteStatus" NOT NULL DEFAULT 'PENDING',
    "polling_station_id" UUID NOT NULL,
    "previous_vote_id" UUID,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polling_stations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "county" VARCHAR(100) NOT NULL,
    "constituency" VARCHAR(100) NOT NULL,
    "ward" VARCHAR(100) NOT NULL,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "address" TEXT,
    "registered_voters" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "opening_time" TIMESTAMP(3),
    "closing_time" TIMESTAMP(3),
    "device_count" INTEGER NOT NULL DEFAULT 0,
    "printer_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polling_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_queue" (
    "id" UUID NOT NULL,
    "vote_id" UUID NOT NULL,
    "polling_station_id" UUID NOT NULL,
    "status" "PrintStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "printer_id" VARCHAR(100),
    "printed_at" TIMESTAMP(3),
    "print_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "ballot_number" VARCHAR(50),
    "qr_code_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voters_national_id_key" ON "voters"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "voters_sbt_address_key" ON "voters"("sbt_address");

-- CreateIndex
CREATE INDEX "voters_national_id_idx" ON "voters"("national_id");

-- CreateIndex
CREATE INDEX "voters_sbt_address_idx" ON "voters"("sbt_address");

-- CreateIndex
CREATE INDEX "voters_polling_station_id_idx" ON "voters"("polling_station_id");

-- CreateIndex
CREATE INDEX "voters_status_idx" ON "voters"("status");

-- CreateIndex
CREATE UNIQUE INDEX "votes_serial_number_key" ON "votes"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "votes_previous_vote_id_key" ON "votes"("previous_vote_id");

-- CreateIndex
CREATE INDEX "votes_serial_number_idx" ON "votes"("serial_number");

-- CreateIndex
CREATE INDEX "votes_polling_station_id_idx" ON "votes"("polling_station_id");

-- CreateIndex
CREATE INDEX "votes_status_idx" ON "votes"("status");

-- CreateIndex
CREATE INDEX "votes_timestamp_idx" ON "votes"("timestamp");

-- CreateIndex
CREATE INDEX "votes_blockchain_tx_hash_idx" ON "votes"("blockchain_tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "polling_stations_code_key" ON "polling_stations"("code");

-- CreateIndex
CREATE INDEX "polling_stations_code_idx" ON "polling_stations"("code");

-- CreateIndex
CREATE INDEX "polling_stations_county_idx" ON "polling_stations"("county");

-- CreateIndex
CREATE INDEX "polling_stations_constituency_idx" ON "polling_stations"("constituency");

-- CreateIndex
CREATE INDEX "polling_stations_ward_idx" ON "polling_stations"("ward");

-- CreateIndex
CREATE INDEX "polling_stations_is_active_idx" ON "polling_stations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "print_queue_vote_id_key" ON "print_queue"("vote_id");

-- CreateIndex
CREATE UNIQUE INDEX "print_queue_ballot_number_key" ON "print_queue"("ballot_number");

-- CreateIndex
CREATE INDEX "print_queue_status_idx" ON "print_queue"("status");

-- CreateIndex
CREATE INDEX "print_queue_polling_station_id_idx" ON "print_queue"("polling_station_id");

-- CreateIndex
CREATE INDEX "print_queue_priority_idx" ON "print_queue"("priority");

-- CreateIndex
CREATE INDEX "print_queue_printer_id_idx" ON "print_queue"("printer_id");

-- AddForeignKey
ALTER TABLE "voters" ADD CONSTRAINT "voters_polling_station_id_fkey" FOREIGN KEY ("polling_station_id") REFERENCES "polling_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_polling_station_id_fkey" FOREIGN KEY ("polling_station_id") REFERENCES "polling_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_previous_vote_id_fkey" FOREIGN KEY ("previous_vote_id") REFERENCES "votes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_queue" ADD CONSTRAINT "print_queue_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_queue" ADD CONSTRAINT "print_queue_polling_station_id_fkey" FOREIGN KEY ("polling_station_id") REFERENCES "polling_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
