-- OPT-IN LOCAL DEVELOPMENT ONLY. Requires psql -v user_id=<existing auth UUID>.
begin;
insert into public.shoes(id,user_id,title,brand,initial_distance_m) values('d1000000-0000-4000-8000-000000000001',:'user_id','[DEV] Everyday trainer','Development fixture',42000);
insert into public.activities(user_id,title,started_at,distance_m,elapsed_s,shoe_id) values
(:'user_id','[DEV] River valley easy',current_date-2,8420,2728,'d1000000-0000-4000-8000-000000000001'),
(:'user_id','[DEV] Lunch loop',current_date-1,5100,1710,'d1000000-0000-4000-8000-000000000001');
insert into public.routes(user_id,title,description,distance_m) values(:'user_id','[DEV] River valley loop','Development metadata only. No GPS geometry or condition report.',8420);
insert into public.workouts(user_id,title,scheduled_on,description) values(:'user_id','[DEV] Easy conversational run',current_date+1,'30 minutes, comfortable effort. Development fixture.');
commit;
