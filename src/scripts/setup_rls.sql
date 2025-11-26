-- Enable RLS on questions table
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Policy: Teachers can view all items (for exam creation)
CREATE POLICY "Teachers view all items" 
ON questions FOR SELECT 
USING (auth.role() = 'authenticated' AND (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
));

-- Policy: Students can only view items assigned to them in an active exam attempt
-- This is complex, usually handled by application logic (backend API), 
-- but for direct Supabase access (if used), we'd need a join.
-- For now, we restrict direct student access to questions.
CREATE POLICY "Students cannot view items directly"
ON questions FOR SELECT
USING (false);

-- Policy: Teachers can insert items
CREATE POLICY "Teachers insert items"
ON questions FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
);

-- Policy: Teachers can update their own items (or all items if collaborative)
CREATE POLICY "Teachers update items"
ON questions FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
);
