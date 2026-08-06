-- One-time fix: local migration file was edited after apply; sync checksum so `migrate dev` works.
-- Safe: migration is a no-op (SELECT 1). Do NOT run migrate reset on production Neon.
UPDATE "_prisma_migrations"
SET checksum = 'c4f796ee40c4710238fb26acf69022b51189ec0ac1f47624b3e8802da0eef9e0'
WHERE migration_name = '20260306030953_editvariant_prod';
