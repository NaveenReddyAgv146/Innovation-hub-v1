from __future__ import annotations

from datetime import datetime, timedelta, timezone

from bson import ObjectId
from pymongo import MongoClient

from app.core.config import settings
from app.core.security import hash_password
from app.schemas.auth import compose_full_name

SEED_TAG = "manager-demo-2026"
DEMO_PASSWORD = "Demo123"


DEMO_USERS = [
    {
        "email": "ananya.iyer@agivant.com",
        "firstName": "Ananya",
        "lastName": "Iyer",
        "role": "viewer",
        "employeeId": None,
        "adminTrack": None,
    },
    {
        "email": "praveen.kumar@agivant.com",
        "firstName": "Praveen",
        "lastName": "Kumar",
        "role": "viewer",
        "employeeId": None,
        "adminTrack": None,
    },
    {
        "email": "meera.nair@agivant.com",
        "firstName": "Meera",
        "lastName": "Nair",
        "role": "viewer",
        "employeeId": None,
        "adminTrack": None,
    },
    {
        "email": "arjun.shah@agivant.com",
        "firstName": "Arjun",
        "lastName": "Shah",
        "role": "viewer",
        "employeeId": None,
        "adminTrack": None,
    },
    {
        "email": "kavya.reddy@agivant.com",
        "firstName": "Kavya",
        "lastName": "Reddy",
        "role": "viewer",
        "employeeId": None,
        "adminTrack": None,
    },
    {
        "email": "priya.menon@agivant.com",
        "firstName": "Priya",
        "lastName": "Menon",
        "role": "viewer",
        "employeeId": "AGV-1001",
        "adminTrack": None,
    },
    {
        "email": "rahul.verma@agivant.com",
        "firstName": "Rahul",
        "lastName": "Verma",
        "role": "viewer",
        "employeeId": "AGV-1002",
        "adminTrack": None,
    },
    {
        "email": "sneha.patel@agivant.com",
        "firstName": "Sneha",
        "lastName": "Patel",
        "role": "viewer",
        "employeeId": "AGV-1003",
        "adminTrack": None,
    },
    {
        "email": "vikram.joshi@agivant.com",
        "firstName": "Vikram",
        "lastName": "Joshi",
        "role": "viewer",
        "employeeId": "AGV-1004",
        "adminTrack": None,
    },
]


TEST_USERS = [
    {
        "email": "user1@agivant.com",
        "firstName": "User",
        "lastName": "1",
        "role": "viewer",
        "employeeId": "TEST-2001",
        "adminTrack": None,
    },
    {
        "email": "user2@agivant.com",
        "firstName": "User",
        "lastName": "2",
        "role": "viewer",
        "employeeId": "TEST-2002",
        "adminTrack": None,
    },
    {
        "email": "user3@agivant.com",
        "firstName": "User",
        "lastName": "3",
        "role": "viewer",
        "employeeId": "TEST-2003",
        "adminTrack": None,
    },
    {
        "email": "user4@agivant.com",
        "firstName": "User",
        "lastName": "4",
        "role": "viewer",
        "employeeId": "TEST-2004",
        "adminTrack": None,
    },
]


TEST_LIVE_POCS = [
    {
        "seedKey": "test-innovation-1",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "test innovation 1",
        "description": "Live test contribution for Solutions track with impact-focused prioritization.",
        "customer": "Test Customer 1",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Need a quick test contribution that appears in live lists and dashboards.",
        "requestorName": "Ananya Iyer",
        "impact": "High",
        "estimatedDurationValue": 3,
        "estimatedDurationUnit": "weeks",
        "techStack": ["React", "FastAPI", "MongoDB"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 6,
        "updatedDaysAgo": 1,
        "interestEmails": [("user2@agivant.com", 8, "per week"), ("user3@agivant.com", 6, "per week")],
        "approvedEmails": ["user2@agivant.com", "user3@agivant.com"],
    },
    {
        "seedKey": "test-innovation-2",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "test innovation 2",
        "description": "Live test contribution for Solutions track focused on assignment distribution.",
        "customer": "Test Customer 2",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "New",
        "challenges": "Validate interested and approved user behavior in live state.",
        "requestorName": "Ananya Iyer",
        "impact": "Medium",
        "estimatedDurationValue": 5,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Next.js", "Node.js", "PostgreSQL"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 7,
        "updatedDaysAgo": 1,
        "interestEmails": [("user1@agivant.com", 4, "per day"), ("user2@agivant.com", 7, "per week"), ("user4@agivant.com", 3, "per day")],
        "approvedEmails": ["user1@agivant.com", "user2@agivant.com", "user4@agivant.com"],
    },
    {
        "seedKey": "test-innovation-3",
        "authorEmail": "praveen.kumar@agivant.com",
        "title": "test innovation 3",
        "description": "Live test contribution for Delivery track.",
        "customer": "Test Customer 3",
        "track": "Delivery",
        "pointOfContact": "praveen.kumar@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Need consistent live test entries for each track.",
        "requestorName": "Praveen Kumar",
        "impact": "Low",
        "estimatedDurationValue": 2,
        "estimatedDurationUnit": "months",
        "techStack": ["Python", "FastAPI", "Redis"],
        "status": "live",
        "liveAtDaysAgo": 3,
        "createdDaysAgo": 8,
        "updatedDaysAgo": 1,
        "interestEmails": [("user2@agivant.com", 6, "per week"), ("user3@agivant.com", 5, "per week")],
        "approvedEmails": ["user2@agivant.com", "user3@agivant.com"],
    },
    {
        "seedKey": "test-innovation-4",
        "authorEmail": "praveen.kumar@agivant.com",
        "title": "test innovation 4",
        "description": "Second live Delivery contribution for track tab testing.",
        "customer": "Test Customer 4",
        "track": "Delivery",
        "pointOfContact": "praveen.kumar@agivant.com",
        "customerClassification": "New",
        "challenges": "Ensure two live items per track are visible in contribution tabs.",
        "requestorName": "Praveen Kumar",
        "impact": "High",
        "estimatedDurationValue": 10,
        "estimatedDurationUnit": "days",
        "techStack": ["React", "TypeScript", "MongoDB"],
        "status": "live",
        "liveAtDaysAgo": 1,
        "createdDaysAgo": 5,
        "updatedDaysAgo": 1,
        "interestEmails": [("user1@agivant.com", 2, "per day")],
        "approvedEmails": ["user1@agivant.com"],
    },
    {
        "seedKey": "test-innovation-5",
        "authorEmail": "meera.nair@agivant.com",
        "title": "test innovation 5",
        "description": "Live Learning contribution with mixed impact and assignment load.",
        "customer": "Test Customer 5",
        "track": "Learning",
        "pointOfContact": "meera.nair@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Need varied impact values across test contributions.",
        "requestorName": "Meera Nair",
        "impact": "Medium",
        "estimatedDurationValue": 4,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Vue", "Firebase", "Chart.js"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 6,
        "updatedDaysAgo": 1,
        "interestEmails": [("user2@agivant.com", 6, "per week"), ("user3@agivant.com", 3, "per day"), ("user4@agivant.com", 4, "per week")],
        "approvedEmails": ["user2@agivant.com", "user3@agivant.com", "user4@agivant.com"],
    },
    {
        "seedKey": "test-innovation-6",
        "authorEmail": "meera.nair@agivant.com",
        "title": "test innovation 6",
        "description": "Second live Learning contribution.",
        "customer": "Test Customer 6",
        "track": "Learning",
        "pointOfContact": "meera.nair@agivant.com",
        "customerClassification": "New",
        "challenges": "Exercise contribution tab rendering with compact test labels.",
        "requestorName": "Meera Nair",
        "impact": "Low",
        "estimatedDurationValue": 12,
        "estimatedDurationUnit": "days",
        "techStack": ["Svelte", "Supabase", "Node.js"],
        "status": "live",
        "liveAtDaysAgo": 3,
        "createdDaysAgo": 9,
        "updatedDaysAgo": 1,
        "interestEmails": [("user3@agivant.com", 7, "per week")],
        "approvedEmails": ["user3@agivant.com"],
    },
    {
        "seedKey": "test-innovation-7",
        "authorEmail": "arjun.shah@agivant.com",
        "title": "test innovation 7",
        "description": "Live GTM/Sales contribution for approval flow testing.",
        "customer": "Test Customer 7",
        "track": "GTM/Sales",
        "pointOfContact": "arjun.shah@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Verify cross-list movement between interested and approved users.",
        "requestorName": "Arjun Shah",
        "impact": "High",
        "estimatedDurationValue": 1,
        "estimatedDurationUnit": "months",
        "techStack": ["React", "FastAPI", "OpenAI API"],
        "status": "live",
        "liveAtDaysAgo": 1,
        "createdDaysAgo": 4,
        "updatedDaysAgo": 1,
        "interestEmails": [("user3@agivant.com", 5, "per week"), ("user4@agivant.com", 2, "per day")],
        "approvedEmails": ["user3@agivant.com", "user4@agivant.com"],
    },
    {
        "seedKey": "test-innovation-8",
        "authorEmail": "arjun.shah@agivant.com",
        "title": "test innovation 8",
        "description": "Second live GTM/Sales contribution.",
        "customer": "Test Customer 8",
        "track": "GTM/Sales",
        "pointOfContact": "arjun.shah@agivant.com",
        "customerClassification": "New",
        "challenges": "Need stable live data for demos in contribution tabs.",
        "requestorName": "Arjun Shah",
        "impact": "Medium",
        "estimatedDurationValue": 14,
        "estimatedDurationUnit": "days",
        "techStack": ["Next.js", "MongoDB", "Tailwind CSS"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 6,
        "updatedDaysAgo": 1,
        "interestEmails": [("user1@agivant.com", 8, "per week"), ("user2@agivant.com", 3, "per day")],
        "approvedEmails": ["user1@agivant.com", "user2@agivant.com"],
    },
    {
        "seedKey": "test-innovation-9",
        "authorEmail": "kavya.reddy@agivant.com",
        "title": "test innovation 9",
        "description": "Live Thought Leadership contribution.",
        "customer": "Test Customer 9",
        "track": "Organizational Building & Thought Leadership",
        "pointOfContact": "kavya.reddy@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Need final track coverage in live state for demo dashboards.",
        "requestorName": "Kavya Reddy",
        "impact": "Low",
        "estimatedDurationValue": 9,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Python", "Streamlit", "PostgreSQL"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 7,
        "updatedDaysAgo": 1,
        "interestEmails": [("user2@agivant.com", 5, "per week")],
        "approvedEmails": ["user2@agivant.com"],
    },
    {
        "seedKey": "test-innovation-10",
        "authorEmail": "kavya.reddy@agivant.com",
        "title": "test innovation 10",
        "description": "Second live Thought Leadership contribution with different impact.",
        "customer": "Test Customer 10",
        "track": "Organizational Building & Thought Leadership",
        "pointOfContact": "kavya.reddy@agivant.com",
        "customerClassification": "New",
        "challenges": "Ensure all tracks have exactly two test live contributions.",
        "requestorName": "Kavya Reddy",
        "impact": "High",
        "estimatedDurationValue": 2,
        "estimatedDurationUnit": "months",
        "techStack": ["FastAPI", "React", "Power BI"],
        "status": "live",
        "liveAtDaysAgo": 1,
        "createdDaysAgo": 3,
        "updatedDaysAgo": 1,
        "interestEmails": [("user1@agivant.com", 6, "per week")],
        "approvedEmails": ["user1@agivant.com"],
    },
]

FINISHED_CREDIT_TEST_POCS = [
    {
        "seedKey": "credit-test-solutions-1",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "Credit Test Solutions 1",
        "description": "Finished contribution for validating harmonic credit scoring with non-zero hours.",
        "customer": "Credit Test Customer S1",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Validate harmonic credits for medium impact and short-medium execution window.",
        "requestorName": "Ananya Iyer",
        "impact": "Medium",
        "estimatedDurationValue": 2,
        "estimatedDurationUnit": "weeks",
        "techStack": ["React", "FastAPI", "MongoDB"],
        "status": "finished",
        "liveAtHoursAgo": 96,
        "finishedAtHoursAgo": 12,
        "createdDaysAgo": 7,
        "updatedHoursAgo": 11,
        "interestEmails": [("user1@agivant.com", 6, "per week"), ("user2@agivant.com", 10, "per week")],
        "approvedEmails": ["user1@agivant.com", "user2@agivant.com"],
    },
    {
        "seedKey": "credit-test-solutions-2",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "Credit Test Solutions 2",
        "description": "Finished high-impact Solutions contribution to create leaderboard spread.",
        "customer": "Credit Test Customer S2",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "New",
        "challenges": "Create higher impact/hours blend for visible ranking differences.",
        "requestorName": "Ananya Iyer",
        "impact": "High",
        "estimatedDurationValue": 3,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Python", "FastAPI", "PostgreSQL"],
        "status": "finished",
        "liveAtHoursAgo": 120,
        "finishedAtHoursAgo": 18,
        "createdDaysAgo": 8,
        "updatedHoursAgo": 17,
        "interestEmails": [("user2@agivant.com", 5, "per week"), ("user3@agivant.com", 8, "per week")],
        "approvedEmails": ["user2@agivant.com", "user3@agivant.com"],
    },
    {
        "seedKey": "credit-test-delivery-1",
        "authorEmail": "praveen.kumar@agivant.com",
        "title": "Credit Test Delivery 1",
        "description": "Finished Delivery contribution with low impact but longer run-time.",
        "customer": "Credit Test Customer D1",
        "track": "Delivery",
        "pointOfContact": "praveen.kumar@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Validate that low impact can still contribute with enough elapsed time.",
        "requestorName": "Praveen Kumar",
        "impact": "Low",
        "estimatedDurationValue": 10,
        "estimatedDurationUnit": "days",
        "techStack": ["React", "Redis", "MongoDB"],
        "status": "finished",
        "liveAtHoursAgo": 84,
        "finishedAtHoursAgo": 10,
        "createdDaysAgo": 6,
        "updatedHoursAgo": 9,
        "interestEmails": [("user1@agivant.com", 4, "per day"), ("user4@agivant.com", 6, "per week")],
        "approvedEmails": ["user1@agivant.com", "user4@agivant.com"],
    },
    {
        "seedKey": "credit-test-learning-1",
        "authorEmail": "meera.nair@agivant.com",
        "title": "Credit Test Learning 1",
        "description": "Finished Learning contribution for medium impact scoring tests.",
        "customer": "Credit Test Customer L1",
        "track": "Learning",
        "pointOfContact": "meera.nair@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Provide non-zero hours with medium impact for comparison.",
        "requestorName": "Meera Nair",
        "impact": "Medium",
        "estimatedDurationValue": 4,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Vue", "Node.js", "PostgreSQL"],
        "status": "finished",
        "liveAtHoursAgo": 110,
        "finishedAtHoursAgo": 14,
        "createdDaysAgo": 9,
        "updatedHoursAgo": 13,
        "interestEmails": [("user3@agivant.com", 7, "per week"), ("user4@agivant.com", 3, "per day")],
        "approvedEmails": ["user3@agivant.com", "user4@agivant.com"],
    },
    {
        "seedKey": "credit-test-sales-1",
        "authorEmail": "arjun.shah@agivant.com",
        "title": "Credit Test GTM 1",
        "description": "Finished GTM/Sales contribution for high impact scoring.",
        "customer": "Credit Test Customer G1",
        "track": "GTM/Sales",
        "pointOfContact": "arjun.shah@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Stress-test high impact harmonic values.",
        "requestorName": "Arjun Shah",
        "impact": "High",
        "estimatedDurationValue": 2,
        "estimatedDurationUnit": "months",
        "techStack": ["Next.js", "MongoDB", "FastAPI"],
        "status": "finished",
        "liveAtHoursAgo": 132,
        "finishedAtHoursAgo": 20,
        "createdDaysAgo": 10,
        "updatedHoursAgo": 19,
        "interestEmails": [("user2@agivant.com", 9, "per week"), ("user4@agivant.com", 5, "per week")],
        "approvedEmails": ["user2@agivant.com", "user4@agivant.com"],
    },
    {
        "seedKey": "credit-test-thought-1",
        "authorEmail": "kavya.reddy@agivant.com",
        "title": "Credit Test Thought Leadership 1",
        "description": "Finished Thought Leadership contribution with low impact.",
        "customer": "Credit Test Customer T1",
        "track": "Organizational Building & Thought Leadership",
        "pointOfContact": "kavya.reddy@agivant.com",
        "customerClassification": "New",
        "challenges": "Ensure all tracks participate in credit-system demo.",
        "requestorName": "Kavya Reddy",
        "impact": "Low",
        "estimatedDurationValue": 6,
        "estimatedDurationUnit": "weeks",
        "techStack": ["FastAPI", "Metabase", "PostgreSQL"],
        "status": "finished",
        "liveAtHoursAgo": 102,
        "finishedAtHoursAgo": 16,
        "createdDaysAgo": 9,
        "updatedHoursAgo": 15,
        "interestEmails": [("user1@agivant.com", 5, "per week"), ("user3@agivant.com", 4, "per week")],
        "approvedEmails": ["user1@agivant.com", "user3@agivant.com"],
    },
]


DEMO_POCS = [
    {
        "seedKey": "solutions-draft-assistant",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "Proposal Copilot for Solutions Architects",
        "description": "An internal AI assistant that drafts proposal outlines, solution assumptions, and customer-specific architecture notes from discovery inputs.",
        "customer": "Global FinServ Group",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Solutions teams spend too much time rebuilding the same proposal narrative, dependency assumptions, and sizing notes for every new opportunity.",
        "requestorName": "Ananya Iyer",
        "impact": "High",
        "estimatedDurationValue": 8,
        "estimatedDurationUnit": "weeks",
        "techStack": ["FastAPI", "OpenAI API", "Azure AI Search", "React", "PostgreSQL"],
        "status": "draft",
        "createdDaysAgo": 12,
        "updatedDaysAgo": 10,
        "interestEmails": [],
    },
    {
        "seedKey": "solutions-published-risk-analyzer",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "Delivery Risk Analyzer for Solution Handoffs",
        "description": "A handoff-quality engine that scores implementation risks, missing prerequisites, and unclear ownership before a deal moves into delivery.",
        "customer": "NorthBridge Logistics",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "New",
        "challenges": "Handoffs from sales and solutioning to delivery often miss assumptions, integration dependencies, and customer-side owners.",
        "requestorName": "Ananya Iyer",
        "impact": "High",
        "estimatedDurationValue": 6,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Python", "MongoDB", "React", "LangChain", "Docker"],
        "status": "published",
        "createdDaysAgo": 18,
        "updatedDaysAgo": 4,
        "interestEmails": [
            ("priya.menon@agivant.com", 6, "per week"),
            ("rahul.verma@agivant.com", 4, "per week"),
        ],
    },
    {
        "seedKey": "solutions-live-capacity-optimizer",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "AI-Driven Resource Optimizer for Solution Planning",
        "description": "A planning assistant that predicts solution team loading and recommends optimal staffing combinations for active opportunities.",
        "customer": "Evergreen Banking Corp",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Solution teams face over-allocation in peak pursuit periods and under-utilization in quieter phases with no unified planning lens.",
        "requestorName": "Ananya Iyer",
        "impact": "High",
        "estimatedDurationValue": 7,
        "estimatedDurationUnit": "weeks",
        "techStack": ["FastAPI", "React", "MongoDB", "Pandas"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 15,
        "updatedDaysAgo": 2,
        "interestEmails": [
            ("priya.menon@agivant.com", 5, "per week"),
            ("sneha.patel@agivant.com", 3, "per week"),
        ],
    },
    {
        "seedKey": "solutions-finished-accelerator",
        "authorEmail": "ananya.iyer@agivant.com",
        "title": "Reusable Discovery Workshop Accelerator",
        "description": "A ready-to-run workshop kit with AI-generated agenda packs, stakeholder prompts, and synthesis templates for the first week of consulting engagements.",
        "customer": "BluePeak Retail",
        "track": "Solutions",
        "pointOfContact": "ananya.iyer@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Early discovery workshops are inconsistent across accounts, making it hard to scale quality and share reusable best practices.",
        "requestorName": "Ananya Iyer",
        "impact": "Medium",
        "estimatedDurationValue": 5,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Next.js", "Node.js", "Supabase", "OpenAI API"],
        "status": "finished",
        "createdDaysAgo": 36,
        "updatedDaysAgo": 6,
        "interestEmails": [
            ("priya.menon@agivant.com", 5, "per week"),
            ("sneha.patel@agivant.com", 2, "per day"),
        ],
    },
    {
        "seedKey": "delivery-draft-qa-monitor",
        "authorEmail": "praveen.kumar@agivant.com",
        "title": "Release Readiness Monitor for Delivery Teams",
        "description": "A release cockpit that brings sprint health, defect trends, rollout blockers, and stakeholder approvals into one delivery view.",
        "customer": "Vertex Health Systems",
        "track": "Delivery",
        "pointOfContact": "praveen.kumar@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Project leads currently pull release readiness from multiple dashboards, spreadsheets, and chat updates before every go-live.",
        "requestorName": "Praveen Kumar",
        "impact": "High",
        "estimatedDurationValue": 10,
        "estimatedDurationUnit": "weeks",
        "techStack": ["React", "FastAPI", "MongoDB", "Power BI"],
        "status": "draft",
        "createdDaysAgo": 14,
        "updatedDaysAgo": 9,
        "interestEmails": [],
    },
    {
        "seedKey": "delivery-published-hypercare-assistant",
        "authorEmail": "praveen.kumar@agivant.com",
        "title": "Hypercare War Room Assistant",
        "description": "A launch support tool that clusters production incidents, suggests likely root causes, and creates stakeholder-ready daily status notes.",
        "customer": "Prime Mobility",
        "track": "Delivery",
        "pointOfContact": "praveen.kumar@agivant.com",
        "customerClassification": "New",
        "challenges": "Hypercare teams lose time consolidating incident updates and manually preparing summaries for customer leadership.",
        "requestorName": "Praveen Kumar",
        "impact": "High",
        "estimatedDurationValue": 4,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Python", "Azure Functions", "Cosmos DB", "Teams Webhooks"],
        "status": "published",
        "createdDaysAgo": 22,
        "updatedDaysAgo": 3,
        "interestEmails": [
            ("rahul.verma@agivant.com", 8, "per week"),
            ("vikram.joshi@agivant.com", 3, "per day"),
        ],
    },
    {
        "seedKey": "delivery-live-release-command-center",
        "authorEmail": "praveen.kumar@agivant.com",
        "title": "Release Command Center with Incident Forecasting",
        "description": "A delivery command center that predicts release-day incident risk and prioritizes mitigation actions by business impact.",
        "customer": "Astra Commerce",
        "track": "Delivery",
        "pointOfContact": "praveen.kumar@agivant.com",
        "customerClassification": "New",
        "challenges": "Release managers struggle to prioritize blockers quickly when multiple integration and environment risks show up at once.",
        "requestorName": "Praveen Kumar",
        "impact": "High",
        "estimatedDurationValue": 5,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Python", "FastAPI", "MongoDB", "React"],
        "status": "live",
        "liveAtDaysAgo": 1,
        "createdDaysAgo": 13,
        "updatedDaysAgo": 1,
        "interestEmails": [
            ("rahul.verma@agivant.com", 6, "per week"),
            ("vikram.joshi@agivant.com", 2, "per day"),
        ],
    },
    {
        "seedKey": "delivery-finished-capacity-planner",
        "authorEmail": "praveen.kumar@agivant.com",
        "title": "Sprint Capacity Planner with Escalation Forecast",
        "description": "A planner that predicts sprint overload risk and flags likely escalation themes using historical velocity and dependency data.",
        "customer": "Metro Utilities",
        "track": "Delivery",
        "pointOfContact": "praveen.kumar@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Delivery managers need earlier warning when scope and dependencies put sprint commitments at risk.",
        "requestorName": "Praveen Kumar",
        "impact": "Medium",
        "estimatedDurationValue": 7,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Django", "PostgreSQL", "Pandas", "Chart.js"],
        "status": "finished",
        "createdDaysAgo": 45,
        "updatedDaysAgo": 7,
        "interestEmails": [
            ("priya.menon@agivant.com", 4, "per week"),
            ("vikram.joshi@agivant.com", 2, "per day"),
        ],
    },
    {
        "seedKey": "learning-draft-coach",
        "authorEmail": "meera.nair@agivant.com",
        "title": "Role-Based Learning Journey Builder",
        "description": "A guided learning planner that recommends skill pathways, practice labs, and milestone checkpoints for each delivery role.",
        "customer": "Internal Capability Program",
        "track": "Learning",
        "pointOfContact": "meera.nair@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Learning plans are inconsistent across teams and often fail to reflect actual project role expectations.",
        "requestorName": "Meera Nair",
        "impact": "Medium",
        "estimatedDurationValue": 9,
        "estimatedDurationUnit": "weeks",
        "techStack": ["React", "Node.js", "MongoDB", "Tailwind CSS"],
        "status": "draft",
        "createdDaysAgo": 16,
        "updatedDaysAgo": 11,
        "interestEmails": [],
    },
    {
        "seedKey": "learning-published-lab-generator",
        "authorEmail": "meera.nair@agivant.com",
        "title": "Hands-On Lab Generator for New Hires",
        "description": "An AI-backed content generator that creates practice labs, evaluation rubrics, and mentor notes tailored to delivery scenarios.",
        "customer": "Internal Onboarding Academy",
        "track": "Learning",
        "pointOfContact": "meera.nair@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Mentors spend significant time preparing role-specific practice labs for every new onboarding cohort.",
        "requestorName": "Meera Nair",
        "impact": "High",
        "estimatedDurationValue": 6,
        "estimatedDurationUnit": "weeks",
        "techStack": ["FastAPI", "OpenAI API", "Redis", "React"],
        "status": "published",
        "createdDaysAgo": 25,
        "updatedDaysAgo": 5,
        "interestEmails": [
            ("sneha.patel@agivant.com", 6, "per week"),
            ("vikram.joshi@agivant.com", 5, "per week"),
        ],
    },
    {
        "seedKey": "learning-live-skill-gap-radar",
        "authorEmail": "meera.nair@agivant.com",
        "title": "Skill Gap Radar for Delivery Cohorts",
        "description": "A live learning analytics engine that highlights role-level skill gaps and recommends focused interventions for upcoming projects.",
        "customer": "Capability Excellence Office",
        "track": "Learning",
        "pointOfContact": "meera.nair@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Learning leads need early warning on role readiness before deployment windows begin.",
        "requestorName": "Meera Nair",
        "impact": "Medium",
        "estimatedDurationValue": 6,
        "estimatedDurationUnit": "weeks",
        "techStack": ["FastAPI", "React", "PostgreSQL", "Metabase"],
        "status": "live",
        "liveAtDaysAgo": 3,
        "createdDaysAgo": 17,
        "updatedDaysAgo": 2,
        "interestEmails": [
            ("sneha.patel@agivant.com", 4, "per week"),
            ("priya.menon@agivant.com", 2, "per day"),
        ],
    },
    {
        "seedKey": "learning-finished-certification-tracker",
        "authorEmail": "meera.nair@agivant.com",
        "title": "Certification Readiness Tracker",
        "description": "A dashboard that tracks learning completion, mock assessment scores, and certification readiness across delivery cohorts.",
        "customer": "Enterprise Enablement Office",
        "track": "Learning",
        "pointOfContact": "meera.nair@agivant.com",
        "customerClassification": "New",
        "challenges": "Leadership lacks a single source of truth for certification progress across multiple learning cohorts.",
        "requestorName": "Meera Nair",
        "impact": "Low",
        "estimatedDurationValue": 5,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Vue", "Firebase", "BigQuery", "Looker Studio"],
        "status": "finished",
        "createdDaysAgo": 42,
        "updatedDaysAgo": 8,
        "interestEmails": [
            ("rahul.verma@agivant.com", 2, "per day"),
            ("sneha.patel@agivant.com", 4, "per week"),
        ],
    },
    {
        "seedKey": "sales-draft-account-playbook",
        "authorEmail": "arjun.shah@agivant.com",
        "title": "AI Account Planning Playbook",
        "description": "A GTM workspace that summarizes account context, white-space opportunities, and executive talking points for strategic pursuits.",
        "customer": "Strategic Accounts Program",
        "track": "GTM/Sales",
        "pointOfContact": "arjun.shah@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Sales teams prepare account plans manually and often miss reusable research, cross-sell patterns, and recent engagement signals.",
        "requestorName": "Arjun Shah",
        "impact": "High",
        "estimatedDurationValue": 8,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Next.js", "Python", "OpenAI API", "HubSpot API"],
        "status": "draft",
        "createdDaysAgo": 13,
        "updatedDaysAgo": 9,
        "interestEmails": [],
    },
    {
        "seedKey": "sales-published-renewal-insights",
        "authorEmail": "arjun.shah@agivant.com",
        "title": "Renewal Risk and Expansion Insights Hub",
        "description": "A sales intelligence dashboard that combines delivery health, sentiment trends, and renewal milestones to guide account actions.",
        "customer": "Continental Telecom",
        "track": "GTM/Sales",
        "pointOfContact": "arjun.shah@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Account teams struggle to connect delivery signals with renewal conversations early enough to influence outcomes.",
        "requestorName": "Arjun Shah",
        "impact": "High",
        "estimatedDurationValue": 7,
        "estimatedDurationUnit": "weeks",
        "techStack": ["React", "Node.js", "MongoDB", "Salesforce API"],
        "status": "published",
        "createdDaysAgo": 19,
        "updatedDaysAgo": 3,
        "interestEmails": [
            ("priya.menon@agivant.com", 7, "per week"),
            ("rahul.verma@agivant.com", 3, "per day"),
        ],
    },
    {
        "seedKey": "sales-live-opportunity-scorecard",
        "authorEmail": "arjun.shah@agivant.com",
        "title": "Opportunity Scorecard for GTM Execution",
        "description": "A GTM execution cockpit that scores pursuit quality, stakeholder momentum, and next-best actions for active opportunities.",
        "customer": "Horizon Retail Group",
        "track": "GTM/Sales",
        "pointOfContact": "arjun.shah@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Sales teams need a shared way to prioritize active opportunities by quality signals, not just deal size.",
        "requestorName": "Arjun Shah",
        "impact": "High",
        "estimatedDurationValue": 5,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Next.js", "Node.js", "MongoDB", "Salesforce API"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 14,
        "updatedDaysAgo": 2,
        "interestEmails": [
            ("priya.menon@agivant.com", 5, "per week"),
            ("vikram.joshi@agivant.com", 2, "per day"),
        ],
    },
    {
        "seedKey": "sales-finished-qbr-storytelling",
        "authorEmail": "arjun.shah@agivant.com",
        "title": "QBR Storytelling Builder",
        "description": "A structured toolkit that turns account data into executive-ready QBR narratives, wins, risks, and next-step themes.",
        "customer": "Summit Manufacturing",
        "track": "GTM/Sales",
        "pointOfContact": "arjun.shah@agivant.com",
        "customerClassification": "New",
        "challenges": "QBR narratives are manually stitched together from multiple reports and often lack a strong executive storyline.",
        "requestorName": "Arjun Shah",
        "impact": "Medium",
        "estimatedDurationValue": 4,
        "estimatedDurationUnit": "weeks",
        "techStack": ["React", "FastAPI", "OpenAI API", "PostgreSQL"],
        "status": "finished",
        "createdDaysAgo": 38,
        "updatedDaysAgo": 6,
        "interestEmails": [
            ("sneha.patel@agivant.com", 5, "per week"),
            ("vikram.joshi@agivant.com", 1, "per day"),
        ],
    },
    {
        "seedKey": "leadership-draft-voice-of-employee",
        "authorEmail": "kavya.reddy@agivant.com",
        "title": "Voice of Employee Insight Engine",
        "description": "A leadership dashboard that turns anonymous employee feedback into recurring themes, sentiment changes, and action recommendations.",
        "customer": "People and Culture Office",
        "track": "Organizational Building & Thought Leadership",
        "pointOfContact": "kavya.reddy@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Feedback programs produce plenty of comments but very little structured insight that leaders can act on quickly.",
        "requestorName": "Kavya Reddy",
        "impact": "High",
        "estimatedDurationValue": 10,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Python", "Streamlit", "Azure OpenAI", "Cosmos DB"],
        "status": "draft",
        "createdDaysAgo": 11,
        "updatedDaysAgo": 8,
        "interestEmails": [],
    },
    {
        "seedKey": "leadership-published-thought-leadership-radar",
        "authorEmail": "kavya.reddy@agivant.com",
        "title": "Thought Leadership Content Radar",
        "description": "A content planning engine that suggests publishable themes, supporting evidence, and SME interview prompts from market signals and internal wins.",
        "customer": "Executive Strategy Council",
        "track": "Organizational Building & Thought Leadership",
        "pointOfContact": "kavya.reddy@agivant.com",
        "customerClassification": "New",
        "challenges": "Leadership teams need a repeatable way to turn delivery insights into market-facing thought leadership content.",
        "requestorName": "Kavya Reddy",
        "impact": "Medium",
        "estimatedDurationValue": 6,
        "estimatedDurationUnit": "weeks",
        "techStack": ["Next.js", "Sanity", "OpenAI API", "Airtable"],
        "status": "published",
        "createdDaysAgo": 20,
        "updatedDaysAgo": 4,
        "interestEmails": [
            ("priya.menon@agivant.com", 4, "per week"),
            ("sneha.patel@agivant.com", 2, "per day"),
        ],
    },
    {
        "seedKey": "leadership-live-strategy-alignment-hub",
        "authorEmail": "kavya.reddy@agivant.com",
        "title": "Strategy Alignment Hub for Leadership Priorities",
        "description": "A leadership operating view that tracks strategic initiatives, adoption signals, and execution blockers across business units.",
        "customer": "Executive Strategy Council",
        "track": "Organizational Building & Thought Leadership",
        "pointOfContact": "kavya.reddy@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Leadership teams need better real-time visibility into strategic execution health across multiple initiatives.",
        "requestorName": "Kavya Reddy",
        "impact": "High",
        "estimatedDurationValue": 8,
        "estimatedDurationUnit": "weeks",
        "techStack": ["FastAPI", "React", "PostgreSQL", "Power BI"],
        "status": "live",
        "liveAtDaysAgo": 2,
        "createdDaysAgo": 12,
        "updatedDaysAgo": 2,
        "interestEmails": [
            ("rahul.verma@agivant.com", 4, "per week"),
            ("sneha.patel@agivant.com", 2, "per day"),
        ],
    },
    {
        "seedKey": "leadership-finished-capability-heatmap",
        "authorEmail": "kavya.reddy@agivant.com",
        "title": "Capability Heatmap for Strategic Workforce Planning",
        "description": "A workforce insight platform that highlights role gaps, emerging skills, and succession risks across delivery and solution teams.",
        "customer": "Leadership Operations",
        "track": "Organizational Building & Thought Leadership",
        "pointOfContact": "kavya.reddy@agivant.com",
        "customerClassification": "Existing",
        "challenges": "Leaders need a single view of capability health to make hiring, training, and staffing decisions with confidence.",
        "requestorName": "Kavya Reddy",
        "impact": "High",
        "estimatedDurationValue": 12,
        "estimatedDurationUnit": "weeks",
        "techStack": ["FastAPI", "PostgreSQL", "dbt", "Metabase"],
        "status": "finished",
        "createdDaysAgo": 48,
        "updatedDaysAgo": 7,
        "interestEmails": [
            ("rahul.verma@agivant.com", 5, "per week"),
            ("vikram.joshi@agivant.com", 2, "per day"),
        ],
    },
]


def upsert_user(db, payload: dict, now: datetime) -> ObjectId:
    existing = db.users.find_one({"email": payload["email"]})
    doc = {
        "firstName": payload["firstName"],
        "lastName": payload["lastName"],
        "name": compose_full_name(payload["firstName"], payload["lastName"]),
        "email": payload["email"],
        "employeeId": payload["employeeId"],
        "password": hash_password(DEMO_PASSWORD),
        "role": payload["role"],
        "adminTrack": payload["adminTrack"],
        "refreshToken": None,
        "seedTag": SEED_TAG,
        "updatedAt": now,
    }

    if existing:
        db.users.update_one({"_id": existing["_id"]}, {"$set": doc})
        return existing["_id"]

    doc["createdAt"] = now
    result = db.users.insert_one(doc)
    return result.inserted_id


def build_interest_details(user_ids: dict[str, ObjectId], interest_emails: list[tuple[str, int, str]]) -> tuple[list, list]:
    votes = []
    interest_details = []
    for email, value, unit in interest_emails:
        user_id = user_ids[email]
        votes.append(user_id)
        interest_details.append(
            {
                "userId": user_id,
                "availabilityValue": value,
                "availabilityUnit": unit,
            }
        )
    return votes, interest_details


def resolve_user_id(db, user_ids: dict[str, ObjectId], email: str) -> ObjectId | None:
    if email in user_ids:
        return user_ids[email]
    existing = db.users.find_one({"email": email}, {"_id": 1})
    if not existing:
        return None
    user_ids[email] = existing["_id"]
    return existing["_id"]


def build_interest_details_with_lookup(db, user_ids: dict[str, ObjectId], interest_emails: list[tuple[str, int, str]]) -> tuple[list, list]:
    votes = []
    interest_details = []
    for email, value, unit in interest_emails:
        user_id = resolve_user_id(db, user_ids, email)
        if not user_id:
            continue
        votes.append(user_id)
        interest_details.append(
            {
                "userId": user_id,
                "availabilityValue": value,
                "availabilityUnit": unit,
            }
        )
    return votes, interest_details


def build_user_ids(db, user_ids: dict[str, ObjectId], emails: list[str]) -> list[ObjectId]:
    ids: list[ObjectId] = []
    for email in emails:
        user_id = resolve_user_id(db, user_ids, email)
        if user_id:
            ids.append(user_id)
    return ids


def main() -> None:
    client = MongoClient(settings.mongodb_uri)
    db = client[settings.mongodb_db_name]

    now = datetime.now(timezone.utc)
    user_ids: dict[str, ObjectId] = {}

    all_users = DEMO_USERS + TEST_USERS
    all_pocs = DEMO_POCS + TEST_LIVE_POCS + FINISHED_CREDIT_TEST_POCS

    for user in all_users:
        user_ids[user["email"]] = upsert_user(db, user, now)

    created_count = 0
    updated_count = 0

    for poc in all_pocs:
        created_at = now - timedelta(days=poc["createdDaysAgo"])
        updated_at = now - timedelta(days=poc.get("updatedDaysAgo", 0))
        if "updatedHoursAgo" in poc:
            updated_at = now - timedelta(hours=poc["updatedHoursAgo"])
        live_at = None
        finished_at = None
        if "liveAtDaysAgo" in poc:
            live_at = now - timedelta(days=poc["liveAtDaysAgo"])
        elif "liveAtHoursAgo" in poc:
            live_at = now - timedelta(hours=poc["liveAtHoursAgo"])
        elif poc["status"] == "live":
            live_at = updated_at
        if "finishedAtDaysAgo" in poc:
            finished_at = now - timedelta(days=poc["finishedAtDaysAgo"])
        elif "finishedAtHoursAgo" in poc:
            finished_at = now - timedelta(hours=poc["finishedAtHoursAgo"])
        elif poc["status"] == "finished":
            finished_at = updated_at
        votes, interest_details = build_interest_details_with_lookup(db, user_ids, poc["interestEmails"])
        approved_users = build_user_ids(db, user_ids, poc.get("approvedEmails", []))
        approved_details = []
        approved_at_base = live_at or created_at
        for idx, approved_user_id in enumerate(approved_users):
            approved_details.append(
                {
                    "userId": approved_user_id,
                    "approvedAt": approved_at_base + timedelta(hours=(idx + 1)),
                }
            )

        existing = db.pocs.find_one({"seedKey": poc["seedKey"], "seedTag": SEED_TAG})
        credits_per_user = {"High": 10, "Medium": 7, "Low": 5}.get(poc["impact"], 0)
        doc = {
            "seedKey": poc["seedKey"],
            "seedTag": SEED_TAG,
            "title": poc["title"],
            "description": poc["description"],
            "customer": poc["customer"],
            "track": poc["track"],
            "pointOfContact": poc["pointOfContact"],
            "customerClassification": poc["customerClassification"],
            "challenges": poc["challenges"],
            "requestorName": poc["requestorName"],
            "impact": poc["impact"],
            "estimatedDurationValue": poc["estimatedDurationValue"],
            "estimatedDurationUnit": poc["estimatedDurationUnit"],
            "techStack": poc["techStack"],
            "demoLink": "",
            "repoLink": "",
            "repositoryLink": "",
            "thumbnail": "",
            "status": poc["status"],
            "liveAt": live_at,
            "finishedAt": finished_at,
            "votes": votes,
            "interestDetails": interest_details,
            "approvedUsers": approved_users,
            "approvedDetails": approved_details,
            "creditsAwardedAt": finished_at if poc["status"] == "finished" else None,
            "creditsPerUser": credits_per_user if poc["status"] == "finished" else 0,
            "creditsAwardedUserCount": len(approved_users) if poc["status"] == "finished" else 0,
            "creditsAwardedUserIds": approved_users if poc["status"] == "finished" else [],
            "author": user_ids[poc["authorEmail"]],
            "createdAt": created_at,
            "updatedAt": updated_at,
        }

        if existing:
            db.pocs.update_one({"_id": existing["_id"]}, {"$set": doc})
            updated_count += 1
        else:
            db.pocs.insert_one(doc)
            created_count += 1

    print(f"Seeded demo users: {len(all_users)}")
    print(f"Created demo innovations: {created_count}")
    print(f"Updated demo innovations: {updated_count}")
    print("Demo login password for seeded users: Demo123")

    client.close()


if __name__ == "__main__":
    main()
