from typing import Literal

from pydantic import BaseModel, Field


PocStatus = Literal["draft", "published", "finished"]
ImpactLevel = Literal["High", "Medium", "Low"]
EstimatedDurationUnit = Literal["days", "weeks", "months", "years"]
