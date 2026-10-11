from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


OUTPUT_PATH = Path("output/Devin_Edwards_Resume.pdf")


RESUME_DATA = {
    "name": "DEVIN EDWARDS",
    "title": "SYSTEMS-LEVEL SOFTWARE, SIMULATION WORKFLOWS, AND RAPID TECHNICAL ITERATION",
    "links": [
        "Website: www.devinedwards.info",
        "GitHub: github.com/wowitseddy",
        "LinkedIn: linkedin.com/in/devin-edwards-677836149",
        "X: x.com/wowitseddy",
    ],
    "sections": [
        (
            "PROFESSIONAL SUMMARY",
            [
                "Builds simulation-first interfaces, rapid debugging loops, and high-context visual systems across engineering, research, and technical media workflows.",
                "Works at the systems level on tooling, prototypes, observability, and delivery paths that stay useful under real implementation pressure.",
                "Interested in ML and robotics applications for simulated swarm intelligence, along with other practical tools that improve modern workflows.",
            ],
        ),
        (
            "TECHNICAL SCOPE",
            [
                "Human Interface Devices, computing topology, development pipelines, simulation framing, research tooling, and deployment hardening.",
                "Works across frontend systems, prototype infrastructure, retrieval tools, evidence surfacing, debugging instrumentation, and visual runtime behavior.",
                "Uses measurable execution criteria such as throughput, latency, failure distribution, reproducibility, and iteration speed when evaluating systems.",
            ],
        ),
        (
            "PROGRAMMING LANGUAGES OF INTEREST",
            [
                "C, C#, C++, RUST, BEND, JS, TS.",
            ],
        ),
        (
            "SELECTED PROJECT TYPES AND OUTCOMES",
            [
                "Sentinel Construct: mutation intelligence matrix, scenario compilation, and research artifact generation with visibility into throughput, latency, and failure distribution.",
                "Biomed Indexing Tool: retrieval, evidence surfacing, and analyst-facing synthesis for research-oriented workflows.",
                "Portfolio_2025: simulation-first interface, archive surfacing, GLTF-driven visual systems, and deployment workflow hardening.",
                "Additional work includes hardware sourcing add-ons, simulation environments, pipeline bridges from Blender and Isaac to CAD and prototype planning, and workflow tooling for modern technical delivery.",
            ],
        ),
        (
            "ENGINEERING APPROACH",
            [
                "Supports engineering roles and development life cycles with hypothesis-driven implementation: make assumptions explicit, instrument the system, observe failures quickly, and tighten the loop between questioning, building, and validation.",
                "Emphasizes workflows that remain useful beyond a single prototype by making them observable, testable, and resistant to brittle assumptions.",
            ],
        ),
        (
            "AGENTIC MODEL WORKFLOW",
            [
                "Has spent thousands of hours coding with agentic models despite their inaccuracy, using them as draft accelerators rather than authoritative sources.",
                "Rapidly iterates on debugging, gap-bridging, and workarounds when generated code is weak, incomplete, or wrong.",
                "Focuses on intelligence-proofing workflows so future utility survives bad generations, missing context, and low-reliability outputs.",
            ],
        ),
    ],
}


def build_pdf() -> Path:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=LETTER,
        leftMargin=0.8 * inch,
        rightMargin=0.8 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Devin Edwards Resume",
        author="Devin Edwards",
    )

    styles = getSampleStyleSheet()
    name_style = ParagraphStyle(
        "Name",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=HexColor("#111111"),
        spaceAfter=8,
    )
    title_style = ParagraphStyle(
        "RoleTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=HexColor("#333333"),
        spaceAfter=8,
    )
    links_style = ParagraphStyle(
        "Links",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=HexColor("#444444"),
        spaceAfter=10,
    )
    section_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=HexColor("#000000"),
        spaceBefore=6,
        spaceAfter=4,
    )
    bullet_style = ParagraphStyle(
        "BulletBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.4,
        leading=12,
        textColor=HexColor("#222222"),
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=2,
    )

    story = [
        Paragraph(RESUME_DATA["name"], name_style),
        Paragraph(RESUME_DATA["title"], title_style),
        Paragraph(" | ".join(RESUME_DATA["links"]), links_style),
    ]

    for heading, bullets in RESUME_DATA["sections"]:
        story.append(Paragraph(heading, section_style))
        for bullet in bullets:
            story.append(Paragraph(f"• {bullet}", bullet_style))
        story.append(Spacer(1, 4))

    doc.build(story)
    return OUTPUT_PATH.resolve()


if __name__ == "__main__":
    output = build_pdf()
    print(output)