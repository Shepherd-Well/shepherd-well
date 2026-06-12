-- Remove test families created during master-admin church impersonation testing.
-- These were written to Lighthouse (0d8b75b0-0983-47e0-9ff1-540683bd85d0) because
-- the church isolation bug caused ABC's check-in to use the wrong church_id.
-- Phones: 9093466303 (test), 9999999999 (Ben Hurt family)

-- Step 1: Delete check-in records by parent phone
DELETE FROM cm_checkin_records
WHERE parent_phone IN ('9093466303', '9999999999');

-- Step 2: Delete visitor children belonging to these families
DELETE FROM cm_visitor_children
WHERE family_id IN (
  SELECT id FROM cm_visitor_families
  WHERE parent1_phone IN ('9093466303', '9999999999')
     OR parent2_phone IN ('9093466303', '9999999999')
);

-- Step 3: Delete the visitor family records
DELETE FROM cm_visitor_families
WHERE parent1_phone IN ('9093466303', '9999999999')
   OR parent2_phone IN ('9093466303', '9999999999');
