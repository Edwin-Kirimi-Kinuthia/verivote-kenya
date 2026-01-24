-- ============================================
-- VeriVote Kenya - Initial Database Schema
-- ============================================
-- This file runs automatically when PostgreSQL container starts
-- It creates all the tables we need for the voting system

-- Enable useful PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- For generating UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- For encryption functions

-- ============================================
-- VOTERS TABLE
-- ============================================
-- Stores registered voter information
-- Links to their Soul-Bound Token (SBT) on the blockchain

CREATE TABLE IF NOT EXISTS voters (
    -- Primary key: UUID is better than sequential IDs for security
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- National ID (hashed for privacy)
    national_id_hash VARCHAR(64) NOT NULL UNIQUE,
    
    -- Blockchain wallet address where their SBT is stored
    sbt_address VARCHAR(42),  -- Ethereum addresses are 42 chars (0x + 40 hex)
    
    -- PIN hashes (using Argon2, we'll store the hash not the actual PIN)
    normal_pin_hash VARCHAR(255) NOT NULL,
    distress_pin_hash VARCHAR(255) NOT NULL,
    
    -- Voter status tracking
    status VARCHAR(20) DEFAULT 'registered' CHECK (status IN (
        'registered',      -- Registered but hasn't voted
        'voted',           -- Has cast a vote
        'used_distress',   -- Used distress PIN (needs intervention)
        'suspended'        -- Account suspended
    )),
    
    -- How many times they've voted (for multiple voting feature)
    vote_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_vote_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster lookups
CREATE INDEX idx_voters_national_id ON voters(national_id_hash);
CREATE INDEX idx_voters_sbt_address ON voters(sbt_address);
CREATE INDEX idx_voters_status ON voters(status);

-- ============================================
-- POLLING STATIONS TABLE
-- ============================================
-- Kenya has ~46,000 polling stations
-- This table stores their information

CREATE TABLE IF NOT EXISTS polling_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Station identification
    station_code VARCHAR(20) NOT NULL UNIQUE,  -- e.g., "001/001/001"
    station_name VARCHAR(255) NOT NULL,
    
    -- Location hierarchy (Kenya's administrative structure)
    county VARCHAR(100) NOT NULL,
    constituency VARCHAR(100) NOT NULL,
    ward VARCHAR(100) NOT NULL,
    
    -- Capacity and status
    registered_voters INTEGER DEFAULT 0,
    max_capacity INTEGER DEFAULT 700,  -- Typical polling station capacity
    
    -- GPS coordinates (for mapping)
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_stations_county ON polling_stations(county);
CREATE INDEX idx_stations_constituency ON polling_stations(constituency);
CREATE INDEX idx_stations_code ON polling_stations(station_code);

-- ============================================
-- VOTES TABLE
-- ============================================
-- Stores encrypted votes (we NEVER store the actual vote choice)
-- The actual vote content is encrypted and only the hash is stored

CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Unique serial number for receipt/verification
    serial_number VARCHAR(36) NOT NULL UNIQUE,
    
    -- Hash of the encrypted vote (for verification)
    encrypted_vote_hash VARCHAR(64) NOT NULL,
    
    -- Reference to the blockchain transaction
    blockchain_tx_hash VARCHAR(66),  -- Ethereum tx hashes are 66 chars
    block_number BIGINT,
    
    -- Reference to polling station (but NOT to voter - for anonymity!)
    polling_station_id UUID REFERENCES polling_stations(id),
    
    -- Vote metadata (no identifying information)
    election_type VARCHAR(50) NOT NULL,  -- 'presidential', 'gubernatorial', etc.
    
    -- Is this vote superseded by a later vote? (multiple voting feature)
    is_superseded BOOLEAN DEFAULT false,
    superseded_by UUID REFERENCES votes(id),
    
    -- Was this cast with distress PIN? (flagged for review)
    is_distress_flagged BOOLEAN DEFAULT false,
    
    -- Timestamps
    cast_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    blockchain_confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_votes_serial ON votes(serial_number);
CREATE INDEX idx_votes_blockchain_tx ON votes(blockchain_tx_hash);
CREATE INDEX idx_votes_station ON votes(polling_station_id);
CREATE INDEX idx_votes_election ON votes(election_type);
CREATE INDEX idx_votes_cast_at ON votes(cast_at);

-- ============================================
-- PRINT QUEUE TABLE
-- ============================================
-- For the centralized vote printing system (paper backup)

CREATE TABLE IF NOT EXISTS print_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Reference to the vote being printed
    vote_id UUID REFERENCES votes(id) NOT NULL,
    
    -- Print job status
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN (
        'queued',      -- Waiting to be printed
        'printing',    -- Currently printing
        'completed',   -- Successfully printed
        'failed',      -- Print failed
        'cancelled'    -- Print cancelled
    )),
    
    -- Print job metadata
    priority INTEGER DEFAULT 0,  -- Higher = more urgent
    printer_id VARCHAR(50),
    
    -- Timestamps
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_print_status ON print_queue(status);
CREATE INDEX idx_print_queued_at ON print_queue(queued_at);

-- ============================================
-- AUDIT LOG TABLE
-- ============================================
-- Records all important actions for transparency and debugging

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- What happened
    action VARCHAR(100) NOT NULL,  -- e.g., 'VOTER_REGISTERED', 'VOTE_CAST', 'DISTRESS_PIN_USED'
    
    -- Who/what performed the action (not always a voter)
    actor_type VARCHAR(50) NOT NULL,  -- 'voter', 'admin', 'system'
    actor_id VARCHAR(100),  -- Could be voter ID, admin ID, or 'system'
    
    -- Details (JSON for flexibility)
    details JSONB DEFAULT '{}',
    
    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- ============================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================
-- This automatically updates the updated_at column when a row changes

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables with updated_at column
CREATE TRIGGER update_voters_updated_at BEFORE UPDATE ON voters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stations_updated_at BEFORE UPDATE ON polling_stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
-- Make sure our app user can access everything

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO verivote;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO verivote;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ VeriVote Kenya database schema initialized successfully!';
END $$;
