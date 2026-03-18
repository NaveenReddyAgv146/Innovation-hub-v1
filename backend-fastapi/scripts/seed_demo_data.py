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


def main() -> None:
    client = MongoClient(settings.mongodb_uri)
    db = client[settings.mongodb_db_name]

    now = datetime.now(timezone.utc)
    user_ids: dict[str, ObjectId] = {}

    for user in DEMO_USERS:
        user_ids[user["email"]] = upsert_user(db, user, now)

    created_count = 0
    updated_count = 0

    for poc in DEMO_POCS:
        created_at = now - timedelta(days=poc["createdDaysAgo"])
        updated_at = now - timedelta(days=poc["updatedDaysAgo"])
        votes, interest_details = build_interest_details(user_ids, poc["interestEmails"])

        existing = db.pocs.find_one({"seedKey": poc["seedKey"], "seedTag": SEED_TAG})
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
            "votes": votes,
            "interestDetails": interest_details,
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

    print(f"Seeded demo users: {len(DEMO_USERS)}")
    print(f"Created demo innovations: {created_count}")
    print(f"Updated demo innovations: {updated_count}")
    print("Demo login password for seeded users: Demo123")

    client.close()


if __name__ == "__main__":
    main()
