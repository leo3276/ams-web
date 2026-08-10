-- Run this in the Supabase SQL Editor to check for the duplicate-business
-- issue and clean it up.

-- STEP 1: See if you have more than one business tied to your account.
-- Replace YOUR_EMAIL with the email you log in with.
select b.id, b.name, b.created_at
from businesses b
join auth.users u on u.id = b.user_id
where u.email = 'YOUR_EMAIL'
order by b.created_at asc;

-- If this returns more than one row, you've confirmed the duplicate.
-- The FIRST row (earliest created_at) is almost certainly the one with your
-- real transaction history from mobile — the later one is the accidental
-- duplicate from the web business-profile bug.

-- STEP 2: Check which business actually has your transactions in it.
-- Run this for EACH business id you saw above, to see which one has real data.
select count(*) as transaction_count
from transactions
where business_id = 'PASTE_A_BUSINESS_ID_HERE';

-- STEP 3: Once you've identified the empty/duplicate business (the one with
-- 0 or fewer transactions), delete it. Replace with its actual id.
-- This also deletes any transactions attached to it (should be none or few).
delete from businesses where id = 'PASTE_THE_DUPLICATE_BUSINESS_ID_HERE';
