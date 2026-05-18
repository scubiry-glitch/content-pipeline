-- rebind-scopes.sql
-- 按照 scope-design.md 第4节映射表精确重绑定 50 场飞书妙记到三维 scope

BEGIN;

-- Step 0: 删除 scope-design 误导入的记录
DELETE FROM mn_scope_members WHERE meeting_id = '7ad1d77c-e031-4cbc-9ff4-932ced6ed358';
DELETE FROM assets WHERE id = '7ad1d77c-e031-4cbc-9ff4-932ced6ed358';

-- Step 1: 清除所有 feishu-import 绑定
DELETE FROM mn_scope_members WHERE reason = 'feishu-import';

-- Step 2: Scope ID 常量
-- P1=55c419b8 P2=7871ec53 P3=cda04855 P4=1d25cc49 P5=65308173 P6=01d0c6a8
-- T1=913f72e7 T2=8a2582f8 T3=d62a4d88 T4=b9ae1b57 T5=dcb635d4 T6=bdcff55b T7=218f78ce T8=d53da8bd
-- C1=10ee67f5 C1a=4a4c95f6 C1b=ddb345be C1c=9f8f2bc4 C2=64199c0a C3=23ec151d C4=44f652e2 C5=4c2d3ff2 C6=d930c3b3 C7=bdb51007 C8=45dd30fa

-- Step 3: 逐场精确映射 (按 scope-design.md #1-#50)
-- #1 新录音 (4s) — 无绑定（太短）
-- #2 新录音_2 (17min, 风控/国企) → P1/T4/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '16a5142e-2d2b-4cbe-baf9-f09634c1f21b', 'scope-design-v2'),
('b9ae1b57-4413-4b12-9046-624b5d5511bf', '16a5142e-2d2b-4cbe-baf9-f09634c1f21b', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', '16a5142e-2d2b-4cbe-baf9-f09634c1f21b', 'scope-design-v2');

-- #3 新录音 (29s) — 无绑定（太短）
-- #4 新录音_2（江苏公租房, 95min）→ P2/T6/C1a
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('7871ec53-407b-4040-bb8d-3d368f663af9', '4c9987c8-56c4-4387-a0bb-74a88c8b9630', 'scope-design-v2'),
('bdcff55b-8928-4ab0-982a-4b50f9309248', '4c9987c8-56c4-4387-a0bb-74a88c8b9630', 'scope-design-v2'),
('4a4c95f6-5161-4bba-9fd1-3e5299814aa0', '4c9987c8-56c4-4387-a0bb-74a88c8b9630', 'scope-design-v2');

-- #5 新录音（业主装修, 73min）→ P1/T2/C1a
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '5490fe02-f72b-4027-8133-ce5ce4cb6260', 'scope-design-v2'),
('8a2582f8-c9b2-4b73-85a3-9d7f7b7e8442', '5490fe02-f72b-4027-8133-ce5ce4cb6260', 'scope-design-v2'),
('4a4c95f6-5161-4bba-9fd1-3e5299814aa0', '5490fe02-f72b-4027-8133-ce5ce4cb6260', 'scope-design-v2');

-- #6 新录音（汇聚经营, 92min）→ P2/T5/C1a
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('7871ec53-407b-4040-bb8d-3d368f663af9', '91fb5ec7-b1ae-4186-b09d-7183afa2fe22', 'scope-design-v2'),
('dcb635d4-9277-4dc1-b5f3-a421316e2b78', '91fb5ec7-b1ae-4186-b09d-7183afa2fe22', 'scope-design-v2'),
('4a4c95f6-5161-4bba-9fd1-3e5299814aa0', '91fb5ec7-b1ae-4186-b09d-7183afa2fe22', 'scope-design-v2');

-- #7 新录音_2（中介营销, 59min）→ P2/T2/C1a
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('7871ec53-407b-4040-bb8d-3d368f663af9', '30b2d2b2-32c3-4fc4-901a-670bf3fe088f', 'scope-design-v2'),
('8a2582f8-c9b2-4b73-85a3-9d7f7b7e8442', '30b2d2b2-32c3-4fc4-901a-670bf3fe088f', 'scope-design-v2'),
('4a4c95f6-5161-4bba-9fd1-3e5299814aa0', '30b2d2b2-32c3-4fc4-901a-670bf3fe088f', 'scope-design-v2');

-- #8 新录音（飞书知识库, 53min）→ P6/T8
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('01d0c6a8-2502-4221-9803-df9fe10789c6', 'fea6a70e-2b5a-4abb-b7da-f0b673f48264', 'scope-design-v2'),
('d53da8bd-26e1-4948-8917-b23a765a1cf7', 'fea6a70e-2b5a-4abb-b7da-f0b673f48264', 'scope-design-v2');

-- #9 新录音（宁波银行+信托, 91min）→ P1/T1/C4
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'a592ebaf-0c10-4d26-bfe1-36c6b62d7a8d', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', 'a592ebaf-0c10-4d26-bfe1-36c6b62d7a8d', 'scope-design-v2'),
('44f652e2-48e2-4345-aa99-4495a4479ca4', 'a592ebaf-0c10-4d26-bfe1-36c6b62d7a8d', 'scope-design-v2');

-- #10 房屋装修及租赁方案讨论 → P1/T2/C1a
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '57d93483-4bc4-4132-bfd0-44a12b55612f', 'scope-design-v2'),
('8a2582f8-c9b2-4b73-85a3-9d7f7b7e8442', '57d93483-4bc4-4132-bfd0-44a12b55612f', 'scope-design-v2'),
('4a4c95f6-5161-4bba-9fd1-3e5299814aa0', '57d93483-4bc4-4132-bfd0-44a12b55612f', 'scope-design-v2');

-- #11 北京被窝家装业务经营分析 → P3/T5/C1b
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('cda04855-532f-4e65-9a4f-b95c68f7e4ff', '4d353551-5dff-41e8-8a37-b7492466de49', 'scope-design-v2'),
('dcb635d4-9277-4dc1-b5f3-a421316e2b78', '4d353551-5dff-41e8-8a37-b7492466de49', 'scope-design-v2'),
('ddb345be-7f4f-4765-8418-aa01bbc05929', '4d353551-5dff-41e8-8a37-b7492466de49', 'scope-design-v2');

-- #12 北上链家业务经营分析与预算规划 → P2/T5/C1b
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('7871ec53-407b-4040-bb8d-3d368f663af9', '74e2fbeb-e928-48c2-a4ff-703d44d80f87', 'scope-design-v2'),
('dcb635d4-9277-4dc1-b5f3-a421316e2b78', '74e2fbeb-e928-48c2-a4ff-703d44d80f87', 'scope-design-v2'),
('ddb345be-7f4f-4765-8418-aa01bbc05929', '74e2fbeb-e928-48c2-a4ff-703d44d80f87', 'scope-design-v2');

-- #13 业务盈利及融资规划讨论 → P1/T5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '21e6aaa0-011d-4f6f-a591-6a4dab90432f', 'scope-design-v2'),
('dcb635d4-9277-4dc1-b5f3-a421316e2b78', '21e6aaa0-011d-4f6f-a591-6a4dab90432f', 'scope-design-v2');

-- #14 澳洲房产管理软件应用讨论 → P4/T6
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('1d25cc49-9da7-41ae-8468-ef19cf6eff80', '32ecedc1-d30e-4a74-8179-25eb0ae624b6', 'scope-design-v2'),
('bdcff55b-8928-4ab0-982a-4b50f9309248', '32ecedc1-d30e-4a74-8179-25eb0ae624b6', 'scope-design-v2');

-- #15 美租业务方案及定价讨论 → P1/T2
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '6647cf97-05fe-448d-a8b8-4debc0570cab', 'scope-design-v2'),
('8a2582f8-c9b2-4b73-85a3-9d7f7b7e8442', '6647cf97-05fe-448d-a8b8-4debc0570cab', 'scope-design-v2');

-- #16 规则引擎构建及迭代使用讨论 → P4/T7
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('1d25cc49-9da7-41ae-8468-ef19cf6eff80', '85eb7ed5-eb5c-46bd-ba0c-e568ca8a780a', 'scope-design-v2'),
('218f78ce-b889-47e7-923e-da61aa82772e', '85eb7ed5-eb5c-46bd-ba0c-e568ca8a780a', 'scope-design-v2');

-- #17 房屋装修托管业务模式讨论 → P1/T1/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '82c30a18-5101-4744-ab45-3a94e476fefd', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '82c30a18-5101-4744-ab45-3a94e476fefd', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', '82c30a18-5101-4744-ab45-3a94e476fefd', 'scope-design-v2');

-- #18 业务资金成本及合作方案讨论 → P1/T1/C4
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '2ba3ad4d-f634-4123-84aa-7fa5e21dbdd9', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '2ba3ad4d-f634-4123-84aa-7fa5e21dbdd9', 'scope-design-v2'),
('44f652e2-48e2-4345-aa99-4495a4479ca4', '2ba3ad4d-f634-4123-84aa-7fa5e21dbdd9', 'scope-design-v2');

-- #19 宁波银行与贝壳战略合作讨论 → P1/T6/C4
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'cbe2ba07-dff9-4fd6-9f44-46b3ddbb8c32', 'scope-design-v2'),
('bdcff55b-8928-4ab0-982a-4b50f9309248', 'cbe2ba07-dff9-4fd6-9f44-46b3ddbb8c32', 'scope-design-v2'),
('44f652e2-48e2-4345-aa99-4495a4479ca4', 'cbe2ba07-dff9-4fd6-9f44-46b3ddbb8c32', 'scope-design-v2');

-- #20 业务工作进展及规划讨论 → P1/T3
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'f88df550-d635-4b04-90de-fb5506196c0d', 'scope-design-v2'),
('d62a4d88-cbad-4b00-b6b5-d9d77cc0bbe9', 'f88df550-d635-4b04-90de-fb5506196c0d', 'scope-design-v2');

-- #21 AI办公创业公司发展规划 → P6/T8
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('01d0c6a8-2502-4221-9803-df9fe10789c6', 'f1e1b335-4ab8-4153-9601-24a6aa77c47b', 'scope-design-v2'),
('d53da8bd-26e1-4948-8917-b23a765a1cf7', 'f1e1b335-4ab8-4153-9601-24a6aa77c47b', 'scope-design-v2');

-- #22 阿帕斯AI转型发展复盘 → P6/T8
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('01d0c6a8-2502-4221-9803-df9fe10789c6', 'a40e9d9e-2f2c-4190-8acf-cbf47c88b408', 'scope-design-v2'),
('d53da8bd-26e1-4948-8917-b23a765a1cf7', 'a40e9d9e-2f2c-4190-8acf-cbf47c88b408', 'scope-design-v2');

-- #23 房屋装修资金方案及风险讨论 → P1/T4
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'e6b8eede-b5e1-4c52-851f-4d23dc522f19', 'scope-design-v2'),
('b9ae1b57-4413-4b12-9046-624b5d5511bf', 'e6b8eede-b5e1-4c52-851f-4d23dc522f19', 'scope-design-v2');

-- #24 整装业务资金方案讨论 → P1/T1/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '8e249c16-7c2e-4e2f-80ed-c67adf823d46', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '8e249c16-7c2e-4e2f-80ed-c67adf823d46', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', '8e249c16-7c2e-4e2f-80ed-c67adf823d46', 'scope-design-v2');

-- #25 投资收益分配及权责问题讨论 → P1/T1/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'a4f78546-39ca-4556-94c5-37f1a82d9ec1', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', 'a4f78546-39ca-4556-94c5-37f1a82d9ec1', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', 'a4f78546-39ca-4556-94c5-37f1a82d9ec1', 'scope-design-v2');

-- #26 星图计划业务结构调整讨论 → P1/T1/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'd1ca3fdc-7a90-45ce-a99b-6a6c379c01f5', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', 'd1ca3fdc-7a90-45ce-a99b-6a6c379c01f5', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', 'd1ca3fdc-7a90-45ce-a99b-6a6c379c01f5', 'scope-design-v2');

-- #27 信托资金运用及后端模式讨论 → P1/T1/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '71b42dbe-cdc8-4ec3-aa3b-6dca7cf5416b', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '71b42dbe-cdc8-4ec3-aa3b-6dca7cf5416b', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', '71b42dbe-cdc8-4ec3-aa3b-6dca7cf5416b', 'scope-design-v2');

-- #28 贝壳与新雅欣中高端租赁业务交流 → P1/T6/C8
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '752adf78-55a4-4af5-9064-ee7e6450d93c', 'scope-design-v2'),
('bdcff55b-8928-4ab0-982a-4b50f9309248', '752adf78-55a4-4af5-9064-ee7e6450d93c', 'scope-design-v2'),
('45dd30fa-8db0-484a-b08d-438427a7c412', '752adf78-55a4-4af5-9064-ee7e6450d93c', 'scope-design-v2');

-- #29 中高端分散式公寓业务合作讨论 → P1/T2/C1a
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '0fd7dd41-9a74-46d9-b80c-0c8d542a32e6', 'scope-design-v2'),
('8a2582f8-c9b2-4b73-85a3-9d7f7b7e8442', '0fd7dd41-9a74-46d9-b80c-0c8d542a32e6', 'scope-design-v2'),
('4a4c95f6-5161-4bba-9fd1-3e5299814aa0', '0fd7dd41-9a74-46d9-b80c-0c8d542a32e6', 'scope-design-v2');

-- #30 业务运营与资金结构规划讨论 → P1/T1/C2
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '153619d6-451b-41d1-a631-9f97f4afc8e2', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '153619d6-451b-41d1-a631-9f97f4afc8e2', 'scope-design-v2'),
('64199c0a-bcbb-4ca8-90b8-9de5a1f3ab65', '153619d6-451b-41d1-a631-9f97f4afc8e2', 'scope-design-v2');

-- #31 万华零甲醛板材及金融服务讨论 → P1/T3/C2
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '1efb271a-be86-44d0-bec2-11f0108a6be3', 'scope-design-v2'),
('d62a4d88-cbad-4b00-b6b5-d9d77cc0bbe9', '1efb271a-be86-44d0-bec2-11f0108a6be3', 'scope-design-v2'),
('64199c0a-bcbb-4ca8-90b8-9de5a1f3ab65', '1efb271a-be86-44d0-bec2-11f0108a6be3', 'scope-design-v2');

-- #32 业务风控措施规划与讨论 → P1/T4
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'fcfa393b-2b97-4a3f-94c1-3927c75644bf', 'scope-design-v2'),
('b9ae1b57-4413-4b12-9046-624b5d5511bf', 'fcfa393b-2b97-4a3f-94c1-3927c75644bf', 'scope-design-v2');

-- #33 办公区退租方案讨论 → P2/T7
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('7871ec53-407b-4040-bb8d-3d368f663af9', '6034ea71-aa90-4c40-88c9-2de10c2ef592', 'scope-design-v2'),
('218f78ce-b889-47e7-923e-da61aa82772e', '6034ea71-aa90-4c40-88c9-2de10c2ef592', 'scope-design-v2');

-- #34 家装业务资金方案及报价讨论 → P1/T1/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '21ce43ba-cab0-4e4b-9354-e944bb862686', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '21ce43ba-cab0-4e4b-9354-e944bb862686', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', '21ce43ba-cab0-4e4b-9354-e944bb862686', 'scope-design-v2');

-- #35 内容运营流程及爬虫工具规划 → P5/T7
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('65308173-895a-4a88-970b-9881546d5391', '81adabe9-b407-463f-b3fd-aadd916b983d', 'scope-design-v2'),
('218f78ce-b889-47e7-923e-da61aa82772e', '81adabe9-b407-463f-b3fd-aadd916b983d', 'scope-design-v2');

-- #36 业主装修资金方案规划 → P1/T1/C4
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '2b04af2b-4792-4720-9366-bdc3ecb00b1e', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '2b04af2b-4792-4720-9366-bdc3ecb00b1e', 'scope-design-v2'),
('44f652e2-48e2-4345-aa99-4495a4479ca4', '2b04af2b-4792-4720-9366-bdc3ecb00b1e', 'scope-design-v2');

-- #37 短周期资金方案及责任规划 → P1/T1/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '728a6650-ef75-4c4d-9b04-9470facc94a7', 'scope-design-v2'),
('913f72e7-ca0b-4446-8f22-3207dc771209', '728a6650-ef75-4c4d-9b04-9470facc94a7', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', '728a6650-ef75-4c4d-9b04-9470facc94a7', 'scope-design-v2');

-- #38 业务资金预算与人员安排规划 → P1/T5/C1a
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'ba7551ca-6e50-4527-8c2a-a6244b494a63', 'scope-design-v2'),
('dcb635d4-9277-4dc1-b5f3-a421316e2b78', 'ba7551ca-6e50-4527-8c2a-a6244b494a63', 'scope-design-v2'),
('4a4c95f6-5161-4bba-9fd1-3e5299814aa0', 'ba7551ca-6e50-4527-8c2a-a6244b494a63', 'scope-design-v2');

-- #39 仓储管理及装修业务规划 → P1/T3
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'f891adad-02f5-4c0b-81da-7e805ea12e64', 'scope-design-v2'),
('d62a4d88-cbad-4b00-b6b5-d9d77cc0bbe9', 'f891adad-02f5-4c0b-81da-7e805ea12e64', 'scope-design-v2');

-- #40 信托发包时间及资金问题讨论 → P1/T3/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '54549946-fe97-4ff4-aeb7-17759c77d284', 'scope-design-v2'),
('d62a4d88-cbad-4b00-b6b5-d9d77cc0bbe9', '54549946-fe97-4ff4-aeb7-17759c77d284', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', '54549946-fe97-4ff4-aeb7-17759c77d284', 'scope-design-v2');

-- #41 第二批业务发包流程复盘 → P1/T3/C5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'ff2cf91a-8db6-48af-9e5b-e10881ae30cf', 'scope-design-v2'),
('d62a4d88-cbad-4b00-b6b5-d9d77cc0bbe9', 'ff2cf91a-8db6-48af-9e5b-e10881ae30cf', 'scope-design-v2'),
('4c2d3ff2-066c-4420-8dec-5c4e0abd0c64', 'ff2cf91a-8db6-48af-9e5b-e10881ae30cf', 'scope-design-v2');

-- #42 房屋托管业务合作规划 → P1/T6/C6
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '3dedef1d-7f99-40d5-b241-dcaceb651eed', 'scope-design-v2'),
('bdcff55b-8928-4ab0-982a-4b50f9309248', '3dedef1d-7f99-40d5-b241-dcaceb651eed', 'scope-design-v2'),
('d930c3b3-7fcb-441f-9c77-59176444a56b', '3dedef1d-7f99-40d5-b241-dcaceb651eed', 'scope-design-v2');

-- #43 整装业务流程及供应商管理讨论 → P1/T3
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', '972add98-4fe0-44b6-84a4-d60fcda2d6b4', 'scope-design-v2'),
('d62a4d88-cbad-4b00-b6b5-d9d77cc0bbe9', '972add98-4fe0-44b6-84a4-d60fcda2d6b4', 'scope-design-v2');

-- #44 美租与锦江合作业务讨论 → P1/T6/C3
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('55c419b8-6a1e-4eb6-958f-4665beb3957a', 'ab409370-557a-4731-ad27-f40495da6c87', 'scope-design-v2'),
('bdcff55b-8928-4ab0-982a-4b50f9309248', 'ab409370-557a-4731-ad27-f40495da6c87', 'scope-design-v2'),
('23ec151d-2a69-48e3-aaf1-b4c25d0426aa', 'ab409370-557a-4731-ad27-f40495da6c87', 'scope-design-v2');

-- #45 新录音 (47s, 深度合作) — 无绑定（太短）
-- #46 新录音_1127 (日本住宅) → P4/T6
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('1d25cc49-9da7-41ae-8468-ef19cf6eff80', 'f8e5ab2b-a5ab-494e-93b4-ffc9309229e9', 'scope-design-v2'),
('bdcff55b-8928-4ab0-982a-4b50f9309248', 'f8e5ab2b-a5ab-494e-93b4-ffc9309229e9', 'scope-design-v2');

-- #47 07月09日_1（租赁市场本质, 3h10m）→ P2/T5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('7871ec53-407b-4040-bb8d-3d368f663af9', '0c5bb8a1-3ddb-4c51-8b61-08b9a22b814b', 'scope-design-v2'),
('dcb635d4-9277-4dc1-b5f3-a421316e2b78', '0c5bb8a1-3ddb-4c51-8b61-08b9a22b814b', 'scope-design-v2');

-- #48 03月29日_1（战略方向, 21m）→ —/T5
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('dcb635d4-9277-4dc1-b5f3-a421316e2b78', 'cc4ce5d6-368a-482b-9bf5-fa7e981858ff', 'scope-design-v2');

-- #49 03月29日_2（组织管理, 1h40m）→ —/T7
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('218f78ce-b889-47e7-923e-da61aa82772e', 'd11dec1a-2925-4b30-871b-bfe26e8e815f', 'scope-design-v2');

-- #50 两分钟上手飞书妙记 → P6/T8
INSERT INTO mn_scope_members (scope_id, meeting_id, reason) VALUES
('01d0c6a8-2502-4221-9803-df9fe10789c6', '84ae9b11-015a-4c29-9203-d586923f309f', 'scope-design-v2'),
('d53da8bd-26e1-4948-8917-b23a765a1cf7', '84ae9b11-015a-4c29-9203-d586923f309f', 'scope-design-v2');

-- 还需要处理 #1 (028ac3d8, 4s) 和 #3 (1a2df4d2, 29s) 和 #45 (1d5ea471, 47s) — 全部太短，不绑定

COMMIT;
