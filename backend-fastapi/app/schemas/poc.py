from typing import Literal

from pydantic import BaseModel, Field


PocStatus = Literal["draft", "published"]


class PocUpdateBody(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    techStack: list[str] | None = None
    demoLink: str | None = ""
    repoLink: str | None = ""
    status: PocStatus | None = None
