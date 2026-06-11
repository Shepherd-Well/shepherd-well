-- Persist authorized pickups at the family level (shared by all children)
ALTER TABLE cm_visitor_families ADD COLUMN IF NOT EXISTS authorized_pickups text;

-- Carry authorized pickups through to print-station label jobs
ALTER TABLE cm_label_print_jobs ADD COLUMN IF NOT EXISTS authorized_pickups text;
