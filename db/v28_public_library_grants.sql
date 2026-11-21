-- MegaFrame Studio v2.8: grant minimum required Data API table privileges.
-- Only published artwork/settings belong in megaframe_templates.
-- Existing RLS must remain enabled for public reads and authorized publisher writes.
GRANT SELECT ON TABLE public.megaframe_templates TO anon;
GRANT INSERT, UPDATE ON TABLE public.megaframe_templates TO authenticated;