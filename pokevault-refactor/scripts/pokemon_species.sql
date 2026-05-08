-- pokemon_species reference table
-- Run in Supabase SQL editor before running fetch-pokemon-species.js
-- Provides complete Pokédex data for the Collection Completion modal

CREATE TABLE IF NOT EXISTS pokemon_species (
  pokedex_number integer PRIMARY KEY,
  name           text    NOT NULL,
  type1          text    NOT NULL,
  type2          text,
  category       text    DEFAULT 'Regular',  -- 'Regular','Legendary','Mythical','Ultra Beast'
  generation     integer,
  is_in_go       boolean DEFAULT true,
  is_shiny_available boolean DEFAULT false,
  evolves_from   integer REFERENCES pokemon_species(pokedex_number)
);

CREATE INDEX IF NOT EXISTS idx_species_category ON pokemon_species(category);
CREATE INDEX IF NOT EXISTS idx_species_type     ON pokemon_species(type1, type2);

-- Allow anon reads (same pattern as evolution_chains)
ALTER TABLE pokemon_species DISABLE ROW LEVEL SECURITY;
